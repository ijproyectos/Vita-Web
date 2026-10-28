import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { detectarDosisVencidas, enviarAlertaDosis } from "@/lib/notificaciones/nucleo";
import { entregarAviso, obtenerPreferenciasDe } from "@/lib/notificaciones/avisos";
import { PREFERENCIAS_POR_DEFECTO } from "@/lib/notificaciones/avisos-tipos";
import { procesarAvisosProgramados, type ResumenProgramados } from "@/lib/notificaciones/programados";
import { payloadDosisVencida } from "@/lib/notificaciones/mensajes";
import { purgarAnteriores } from "@/lib/notificaciones/retencion";
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
 * Endpoint invocado por Supabase Cron (`pg_cron`/`pg_net`, migración 018)
 * cada 5 minutos (`*` `/` `5` en la expresión cron). Único punto de
 * entrada externo de este dominio — sin
 * sesión de usuario, autenticado solo por `x-cron-secret` (nunca expuesto
 * en un bundle de cliente). Hace DOS cosas en el mismo job: la alerta al
 * cuidador por dosis vencida (abajo) y, después, los avisos programados de
 * Fase 2 (`procesarAvisosProgramados`, lib/notificaciones/programados.ts).
 * La espera previa a avisar al cuidador sale de `preferencias_avisos` del
 * elder (30 min por defecto).
 *
 * Claim-before-send: el insert en `alertas_dosis` con
 * `on conflict (medicamento_id, fecha) do nothing` decide, antes de
 * enviar nada, si ESTE run es el que gana el derecho a notificar esa
 * dosis. Si `detectarDosisVencidas` la sigue viendo vencida en el próximo
 * tick (porque el elder todavía no la confirmó), el insert ya no
 * devuelve fila — otro run se la quedó — y este run la salta. Así una
 * misma dosis vencida produce como máximo una alerta, incluso con ticks de
 * cron superpuestos o reintentos. Canales: push (web-push, a todas las
 * suscripciones de cada cuidador aceptado) y, solo si hay RESEND_API_KEY,
 * email. Un fallo de envío marca `estado='error'` y NO reintenta; si nadie
 * era alcanzable se libera el claim (no salió nada) y se re-evalúa luego.
 */
export async function POST(request: Request) {
  const secretoEsperado = process.env.CRON_SECRET;
  const secretoRecibido = request.headers.get("x-cron-secret");

  if (!secretoEsperado || !secretoValido(secretoRecibido, secretoEsperado)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const admin = createAdminClient();
  // Si la detección falla (ej. error transitorio de lectura) no se pierden los
  // avisos programados de este tick: se sigue con una lista vacía.
  let dosisVencidas: Awaited<ReturnType<typeof detectarDosisVencidas>> = [];
  let errorDeteccion: string | undefined;
  try {
    dosisVencidas = await detectarDosisVencidas(admin);
  } catch (e) {
    errorDeteccion = e instanceof Error ? e.message : "Fallo la detección de dosis vencidas.";
  }

  let alertados = 0;
  let omitidos = 0;
  let errores = 0;
  let sinCanal = 0;
  let pushEnviados = 0;

  // "Si no confirma una toma" es una preferencia del cuidador (migración 028):
  // quien la apagó no recibe la alerta. Sin la migración, todos la reciben.
  const prefsCuidadores = await obtenerPreferenciasDe(admin, [...new Set(dosisVencidas.flatMap((d) => d.cuidadorIds))]).catch(
    () => new Map<string, typeof PREFERENCIAS_POR_DEFECTO>()
  );

  for (const dosis of dosisVencidas.map((d) => ({
    ...d,
    cuidadorIds: d.cuidadorIds.filter((id) => (prefsCuidadores.get(id) ?? PREFERENCIAS_POR_DEFECTO).pendiente_persona),
  }))) {
    // Todos los cuidadores apagaron este aviso: no se reclama nada.
    if (dosis.cuidadorIds.length === 0) continue;
    // Dedupe por fecha de pared AR (no UTC): ver `fechaAR` en tipos.ts.
    const { data: reclamada, error: errorClaim } = await admin
      .from("alertas_dosis")
      .upsert(
        {
          medicamento_id: dosis.medicamentoId,
          fecha: dosis.fechaAR,
          destinatarios: dosis.cuidadorIds.length,
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

    // Canal 1 — push a cada cuidador aceptado (funciona sin Resend) + el aviso
    // en su centro de notificaciones (/app/avisos), que no depende del push.
    const payload = payloadDosisVencida(dosis);
    let enviadosPush = 0;
    let fallidosPush = 0;
    let suscripciones = 0;
    let enFeed = 0;
    for (const cuidadorId of dosis.cuidadorIds) {
      const r = await entregarAviso(
        admin,
        cuidadorId,
        { tipo: "dosis_vencida_cuidador", titulo: payload.body, url: payload.url, personaId: dosis.elderId, datos: { elderId: dosis.elderId, medicamentoId: dosis.medicamentoId } },
        payload
      );
      enviadosPush += r.push.enviados;
      fallidosPush += r.push.fallidos;
      suscripciones += r.push.total;
      if (r.feed) enFeed++;
    }
    pushEnviados += enviadosPush;

    // Canal 2 — email, solo si Resend está configurado (hoy no lo está).
    let emailEnviado = false;
    let errorEmail: string | null = null;
    if (process.env.RESEND_API_KEY && dosis.destinatarios.length > 0) {
      const resultado = await enviarAlertaDosis(dosis);
      if ("error" in resultado) errorEmail = resultado.error;
      else emailEnviado = true;
    }

    if (enviadosPush === 0 && !emailEnviado && enFeed === 0) {
      if (suscripciones === 0 && !errorEmail) {
        // Nadie era alcanzable (ningún cuidador con avisos activados, ni
        // email, ni se pudo escribir el aviso en su centro): no salió nada, así
        // que se libera el claim para que un tick posterior pueda avisar. No
        // hay riesgo de duplicado porque no salió ninguna notificación.
        await admin.from("alertas_dosis").delete().eq("id", reclamada.id);
        sinCanal++;
        continue;
      }
      // Hubo intento y falló: se marca y NO se reintenta (proteger cuotas).
      errores++;
      await admin
        .from("alertas_dosis")
        .update({
          estado: "error",
          error: errorEmail ?? "No se pudo entregar el push a ningún cuidador.",
          push_fallidos: fallidosPush,
        })
        .eq("id", reclamada.id);
      continue;
    }

    await admin
      .from("alertas_dosis")
      .update({ push_enviados: enviadosPush, push_fallidos: fallidosPush })
      .eq("id", reclamada.id);
    alertados++;
  }

  // Resto de los avisos (a la hora de la toma, segundo aviso, posposiciones,
  // turnos, stock, "ya tomó"). Mismo job de cron: un fallo acá no tumba la
  // respuesta de la alerta al cuidador.
  let programados: ResumenProgramados | { error: string };
  try {
    programados = await procesarAvisosProgramados(admin);
  } catch (e) {
    programados = { error: e instanceof Error ? e.message : "Fallo en los avisos programados." };
  }

  // Retención (sin jobs nuevos; cada tabla degrada a 0 si no existe o falla):
  // - `acciones_agente` (030): datos de salud del chat (incluso de terceros) que solo sirven durante
  //   un reintento o una confirmación de minutos -> 48 h.
  // - `registros_chat` (034): registro de costo/latencia por respuesta -> 90 días.
  const accionesPurgadas = await purgarAnteriores(admin, "acciones_agente");
  const registrosPurgados = await purgarAnteriores(admin, "registros_chat");

  return NextResponse.json({
    accionesPurgadas,
    registrosPurgados,
    detectadas: dosisVencidas.length,
    alertados,
    omitidos,
    errores,
    sinCanal,
    pushEnviados,
    programados,
    ...(errorDeteccion ? { errorDeteccion } : {}),
  });
}
