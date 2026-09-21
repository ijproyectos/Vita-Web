import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { detectarDosisVencidas, enviarAlertaDosis } from "@/lib/notificaciones/nucleo";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Compara `x-cron-secret` contra `CRON_SECRET` en tiempo constante —
 * `timingSafeEqual` exige buffers del mismo largo, así que un largo
 * distinto ya alcanza para descartar sin comparar byte a byte (eso solo
 * filtra el largo del secreto, no su contenido, y es el criterio estándar
 * para este tipo de chequeo).
 */
function secretoValido(recibido: string | null, esperado: string): boolean {
  if (!recibido) return false;
  const bufRecibido = Buffer.from(recibido);
  const bufEsperado = Buffer.from(esperado);
  if (bufRecibido.length !== bufEsperado.length) return false;
  return timingSafeEqual(bufRecibido, bufEsperado);
}

/**
 * Endpoint invocado por Supabase Cron (`pg_cron`/`pg_net`, migración 009)
 * cada 5 minutos (`*` `/` `5` en la expresión cron). Único punto de
 * entrada externo de este dominio — sin
 * sesión de usuario, autenticado solo por `x-cron-secret` (nunca expuesto
 * en un bundle de cliente).
 *
 * Claim-before-send: el insert en `alertas_dosis` con
 * `on conflict (medicamento_id, fecha) do nothing` decide, antes de
 * enviar nada, si ESTE run es el que gana el derecho a notificar esa
 * dosis. Si `detectarDosisVencidas` la sigue viendo vencida en el próximo
 * tick (porque el elder todavía no la confirmó), el insert ya no
 * devuelve fila — otro run se la quedó — y este run la salta. Así una
 * misma dosis vencida produce como máximo un email, incluso con ticks de
 * cron superpuestos o reintentos. Un fallo de envío marca
 * `estado='error'` y NO reintenta — proteger el cap diario de Resend
 * importa más que garantizar la entrega de una alerta puntual.
 */
export async function POST(request: Request) {
  const secretoEsperado = process.env.CRON_SECRET;
  const secretoRecibido = request.headers.get("x-cron-secret");

  if (!secretoEsperado || !secretoValido(secretoRecibido, secretoEsperado)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const admin = createAdminClient();
  const dosisVencidas = await detectarDosisVencidas(admin);

  let alertados = 0;
  let omitidos = 0;
  let errores = 0;

  for (const dosis of dosisVencidas) {
    const { data: reclamada, error: errorClaim } = await admin
      .from("alertas_dosis")
      .upsert(
        {
          medicamento_id: dosis.medicamentoId,
          fecha: dosis.fecha,
          destinatarios: dosis.destinatarios.length,
        },
        { onConflict: "medicamento_id,fecha", ignoreDuplicates: true }
      )
      .select("id")
      .maybeSingle();

    if (errorClaim) {
      // No se pudo ni siquiera reclamar el dedupe — no se envía nada para
      // no arriesgar un duplicado si el error fue transitorio del lado
      // del insert. Se cuenta como error y sigue con la próxima dosis.
      errores++;
      continue;
    }

    if (!reclamada) {
      // Otro run del cron ya reclamó esta (medicamento_id, fecha).
      omitidos++;
      continue;
    }

    const resultado = await enviarAlertaDosis(dosis);

    if ("error" in resultado) {
      errores++;
      await admin
        .from("alertas_dosis")
        .update({ estado: "error", error: resultado.error })
        .eq("id", reclamada.id);
      continue;
    }

    alertados++;
  }

  return NextResponse.json({
    detectadas: dosisVencidas.length,
    alertados,
    omitidos,
    errores,
  });
}
