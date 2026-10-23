import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import * as turnosNucleo from "@/lib/turnos/nucleo";
import * as medicionesNucleo from "@/lib/mediciones/nucleo";
import { diasEntre, haceCuanto, horaEnPalabras } from "./formato";
import { fechaConOffset, fechaDeHoyISO, fechaISOEnAR } from "@/lib/rutina/formato";
import { formatearValor, META_MEDICION } from "@/lib/mediciones/tipos";
import { normalizarLlevar } from "@/lib/turnos/tipos";
import { momentoDelDia } from "@/lib/rutina/momento";
import type { MedicamentoConToma } from "@/lib/medicamentos/tipos";
import type { MedicionSimple, TurnoSimple } from "@/lib/modo-simple/tipos";

// Datos REALES de una persona para su pantalla de modo simple (y para la vista
// previa de Configurar modo simple). `(cliente, personaId)`: la RLS decide el
// acceso (la persona, o un cuidador vinculado).
type Cliente = SupabaseClient;

/**
 * Selección de "lo que toca ahora" en modo simple: las pendientes del mismo
 * momento del día que la próxima pendiente (`hoy` viene ordenado por hora).
 * Lo comparten la pantalla de la persona y la vista previa de Configurar.
 */
export function proximoGrupoPendiente(hoy: MedicamentoConToma[]) {
  const pendientes = hoy.filter((m) => !m.tomado);
  const primera = pendientes[0] ?? null;
  const momento = primera ? momentoDelDia(primera.hora_programada) : null;
  const enGrupo = primera ? pendientes.filter((m) => momentoDelDia(m.hora_programada) === momento) : [];
  const resto = primera ? pendientes.filter((m) => momentoDelDia(m.hora_programada) !== momento) : [];
  return { pendientes, primera, momento, enGrupo, resto };
}

/** Turno de hoy o de mañana (real). Nunca lanza: sin turno o ante un error, null. */
export async function turnoParaMostrar(supabase: Cliente, usuarioId: string): Promise<TurnoSimple | null> {
  try {
    const proximos = await turnosNucleo.listarProximos(supabase, usuarioId, 5);
    const hoy = fechaDeHoyISO();
    const manana = fechaConOffset(1);
    const t = proximos.find((x) => x.fecha === hoy || x.fecha === manana);
    if (!t) return null;
    return {
      dia: t.fecha === hoy ? "hoy" : "manana",
      especialidad: t.especialidad,
      profesional: t.profesional?.trim() || null,
      palabras: horaEnPalabras(t.hora.slice(0, 5)),
      lugar: t.lugar?.trim() || null,
      direccion: t.direccion?.trim() || null,
      llevar: normalizarLlevar(t.llevar)
        .filter((i) => !i.ok)
        .map((i) => i.t),
    };
  } catch {
    return null;
  }
}

/**
 * "Es hora de medirte…": solo los tipos (presión, azúcar) de los que la persona
 * ya tiene mediciones — nunca se inventa un horario ni un valor. Un tipo queda
 * pendiente si no se midió hoy.
 */
export async function medicionesParaMostrar(
  supabase: Cliente,
  usuarioId: string
): Promise<{ titulo: string; items: MedicionSimple[] } | null> {
  const recientes = await medicionesNucleo.listarRecientesSeguro(supabase, usuarioId);
  const hoy = fechaDeHoyISO();
  const items: MedicionSimple[] = [];
  for (const tipo of ["presion", "glucemia"] as const) {
    const ultima = recientes.find((m) => m.tipo === tipo);
    if (!ultima) continue;
    const dias = diasEntre(fechaISOEnAR(new Date(ultima.medido_at)), hoy);
    items.push({
      tipo,
      nombre: tipo === "presion" ? "Presión" : "Azúcar",
      valor: formatearValor(ultima),
      unidad: META_MEDICION[tipo].unidad,
      cuando: haceCuanto(dias),
      pendiente: dias > 0,
    });
  }
  if (items.length === 0) return null;
  const pendientes = items.filter((i) => i.pendiente).map((i) => (i.tipo === "presion" ? "la presión" : "el azúcar"));
  const titulo = pendientes.length > 0 ? `Es hora de medirte ${pendientes.join(" y ")}` : "Tus mediciones";
  return { titulo, items };
}

