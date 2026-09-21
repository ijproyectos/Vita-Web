import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { diaSemanaDe, esDosisVencida, fechaEnUTC, horaEnAR } from "@/lib/medicamentos/nucleo";
import type { DiaSemana } from "@/lib/medicamentos/tipos";
import type { DosisVencida, ResultadoAlertaDosis } from "./tipos";

// Cliente `service_role` (lib/supabase/admin.ts) — este dominio opera
// cruzando usuarios (todos los elders con al menos un cuidador
// vinculado), algo que ninguna sesión de usuario normal puede hacer.
type Cliente = SupabaseClient;

const GRACIA_MIN_DEFAULT = 30;

type FilaMedicamento = {
  id: string;
  usuario_id: string;
  nombre: string;
  dosis: string | null;
  unidad: string;
  hora_programada: string;
  dias_recurrentes: DiaSemana[] | null;
};

/**
 * Detecta, a partir de un instante `ahora`, todas las dosis programadas
 * para hoy que superaron `hora_programada` + `graciaMin` minutos sin una
 * `medicamentos_tomas` confirmada, y resuelve los emails de los
 * cuidadores `aceptado` de cada elder para poder notificarlos.
 *
 * Pura detección: NO escribe en `alertas_dosis` ni envía ningún email —
 * eso es responsabilidad del cron route (Fase 3), que hace el
 * insert-con-dedupe antes de llamar a `enviarAlertaDosis`. Separarlo así
 * evita que esta función se vuelva no-idempotente si algún día se la
 * llama más de una vez para el mismo instante.
 *
 * Recibe un cliente `service_role` (`admin`) porque recorre medicamentos
 * de TODOS los elders con al menos un cuidador vinculado — ninguna RLS
 * de este proyecto permite eso desde una sesión de usuario.
 *
 * **Date gotcha (load-bearing):** `marcarTomado()` (lib/medicamentos/
 * nucleo.ts) graba `medicamentos_tomas.fecha` con `fechaEnUTC()` —
 * fecha UTC — mientras que `hora_programada` es hora de pared AR. Entre
 * las 21:00 y 23:59 AR el reloj UTC ya cruzó la medianoche: una dosis
 * confirmada a las 20:50 AR pudo quedar con `fecha` = el día UTC de ese
 * momento, pero si este detector corre a las 21:05 AR (00:05 UTC del día
 * siguiente) y solo mirara el día UTC de `ahora`, buscaría la
 * confirmación un día tarde y jamás la encontraría — falso positivo. Por
 * eso la confirmación se busca en `fecha IN (hoyUTC, ayerUTC)`, nunca
 * solo `hoyUTC`.
 */
export async function detectarDosisVencidas(
  admin: Cliente,
  ahora: Date = new Date(),
  graciaMin: number = GRACIA_MIN_DEFAULT
): Promise<DosisVencida[]> {
  const diaHoy = diaSemanaDe(ahora);
  const horaAR = horaEnAR(ahora);
  const hoyUTC = fechaEnUTC(ahora);
  const ayerUTC = fechaEnUTC(new Date(ahora.getTime() - 24 * 60 * 60 * 1000));

  const { data: medicamentos, error } = await admin
    .from("medicamentos")
    .select("id, usuario_id, nombre, dosis, unidad, hora_programada, dias_recurrentes");

  if (error) throw new Error(`No se pudieron leer los medicamentos: ${error.message}`);

  const candidatos = ((medicamentos ?? []) as FilaMedicamento[]).filter((m) => {
    const dias = m.dias_recurrentes ?? [];
    const aplicaHoy = dias.length === 0 || dias.includes(diaHoy);
    return aplicaHoy && esDosisVencida(m.hora_programada, horaAR, graciaMin);
  });

  if (candidatos.length === 0) return [];

  // Solo importan los elders con al menos un cuidador `aceptado` — evita
  // procesar (y eventualmente notificar) dosis de elders que nadie cuida.
  const elderIds = [...new Set(candidatos.map((m) => m.usuario_id))];
  const { data: vinculos, error: errorVinculos } = await admin
    .from("vinculos_cuidador")
    .select("elder_id, cuidador_id")
    .eq("estado", "aceptado")
    .in("elder_id", elderIds);

  if (errorVinculos) {
    throw new Error(`No se pudieron leer los vínculos de cuidador: ${errorVinculos.message}`);
  }

  const cuidadoresPorElder = new Map<string, string[]>();
  for (const v of (vinculos ?? []) as { elder_id: string; cuidador_id: string }[]) {
    const lista = cuidadoresPorElder.get(v.elder_id) ?? [];
    lista.push(v.cuidador_id);
    cuidadoresPorElder.set(v.elder_id, lista);
  }

  const conCuidadores = candidatos.filter((m) => cuidadoresPorElder.has(m.usuario_id));
  if (conCuidadores.length === 0) return [];

  const { data: tomas, error: errorTomas } = await admin
    .from("medicamentos_tomas")
    .select("medicamento_id")
    .eq("tomado", true)
    .in("fecha", [hoyUTC, ayerUTC])
    .in(
      "medicamento_id",
      conCuidadores.map((m) => m.id)
    );

  if (errorTomas) {
    throw new Error(`No se pudieron leer las tomas confirmadas: ${errorTomas.message}`);
  }

  const confirmadas = new Set(
    ((tomas ?? []) as { medicamento_id: string }[]).map((t) => t.medicamento_id)
  );
  const vencidas = conCuidadores.filter((m) => !confirmadas.has(m.id));
  if (vencidas.length === 0) return [];

  // Resuelve el email de cada cuidador involucrado una sola vez (no por
  // cada dosis) — `auth.users` no es una tabla de `public`, así que se
  // usa la API admin de auth en vez de un `select` directo.
  const idsCuidadores = [
    ...new Set(vencidas.flatMap((m) => cuidadoresPorElder.get(m.usuario_id) ?? [])),
  ];
  const emailPorCuidador = new Map<string, string>();
  await Promise.all(
    idsCuidadores.map(async (id) => {
      const { data, error: errorUsuario } = await admin.auth.admin.getUserById(id);
      if (!errorUsuario && data?.user?.email) emailPorCuidador.set(id, data.user.email);
    })
  );

  return vencidas.map((m) => ({
    medicamentoId: m.id,
    elderId: m.usuario_id,
    nombre: m.nombre,
    dosis: m.dosis,
    unidad: m.unidad,
    horaProgramada: m.hora_programada,
    fecha: hoyUTC,
    destinatarios: (cuidadoresPorElder.get(m.usuario_id) ?? [])
      .map((id) => emailPorCuidador.get(id))
      .filter((email): email is string => Boolean(email)),
  }));
}

// Vitapp todavía no tiene un dominio propio verificado en Resend — mismo
// estado que ANTHROPIC_API_KEY antes de este pase: la infraestructura de
// envío (dominio verificado + RESEND_API_KEY en Netlify) es una acción
// pendiente del usuario, no algo que este código pueda resolver. El
// remitente se deja como constante documentada, a ajustar cuando el
// dominio esté verificado en Resend.
const REMITENTE_ALERTAS = "vita <alertas@vitappweb.netlify.app>";
const ENDPOINT_RESEND = "https://api.resend.com/emails";

/**
 * Envía el email de "dosis vencida" a los cuidadores de una `DosisVencida`
 * ya detectada. Nunca lanza — mismo criterio que
 * transcribirAudio/generarAudio (lib/voz/nucleo.ts): si falta
 * RESEND_API_KEY, si no hay destinatarios, o si la API de Resend falla,
 * devuelve `{error}` y quien llama decide qué hacer (el cron route marca
 * `alertas_dosis.estado = 'error'`, sin reintentar, para proteger el cap
 * diario de envíos).
 */
export async function enviarAlertaDosis(dosis: DosisVencida): Promise<ResultadoAlertaDosis> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { error: "El envío de alertas por email no está disponible en este momento." };
  }

  if (dosis.destinatarios.length === 0) {
    return { error: "No hay cuidadores para notificar de esta dosis." };
  }

  const dosisTexto = dosis.dosis ? ` (${dosis.dosis} ${dosis.unidad})` : "";

  try {
    const respuesta = await fetch(ENDPOINT_RESEND, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: REMITENTE_ALERTAS,
        to: dosis.destinatarios,
        subject: `Dosis sin confirmar: ${dosis.nombre}`,
        text: `${dosis.nombre}${dosisTexto} estaba programada para las ${dosis.horaProgramada} y todavía no se registró como tomada.`,
      }),
    });

    if (!respuesta.ok) {
      const detalle = await respuesta.text().catch(() => "");
      return { error: `No se pudo enviar la alerta (${respuesta.status}). ${detalle}`.trim() };
    }

    return { enviados: dosis.destinatarios.length };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Error de red al enviar la alerta." };
  }
}
