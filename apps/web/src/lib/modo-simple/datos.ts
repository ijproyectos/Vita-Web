import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import * as turnosNucleo from "@/lib/turnos/nucleo";
import * as medicionesNucleo from "@/lib/mediciones/nucleo";
import * as planesNucleo from "@/lib/mediciones/planes-nucleo";
import { diaSemanaDe, horaEnAR } from "@/lib/medicamentos/nucleo";
import { medirDelDia, turnoHoyOManana, type MedirHoy } from "./medir";
import { diasEntre, haceCuanto, horaEnPalabras } from "./formato";
import { fechaConOffset, fechaDeHoyISO, fechaISOEnAR } from "@/lib/rutina/formato";
import { formatearValor, META_MEDICION } from "@/lib/mediciones/tipos";
import { normalizarLlevar } from "@/lib/turnos/tipos";
import type { MedicionSimple, TurnoSimple } from "@/lib/modo-simple/tipos";
import type { TurnoProximo } from "./respuestas";

import { elegirProximoTurno } from "./seleccion";

export { proximoGrupoPendiente } from "./seleccion";

// Datos REALES de una persona para su pantalla de modo simple (y para la vista
// previa de Configurar modo simple). `(cliente, personaId)`: la RLS decide el
// acceso (la persona, o un cuidador vinculado).
type Cliente = SupabaseClient;

/**
 * Turno de hoy (solo hasta su hora: después desaparece "Hoy tenés turno") o de
 * mañana (real). Nunca lanza: sin turno o ante un error, null.
 */
export async function turnoParaMostrar(supabase: Cliente, usuarioId: string): Promise<TurnoSimple | null> {
  try {
    const proximos = await turnosNucleo.listarProximos(supabase, usuarioId, 10);
    const hoy = fechaDeHoyISO();
    const manana = fechaConOffset(1);
    const t = turnoHoyOManana(proximos, hoy, manana, horaEnAR());
    if (!t) return null;
    return {
      dia: t.fecha === hoy ? "hoy" : "manana",
      hora: t.hora.slice(0, 5),
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
 * Próximo turno (cualquier día futuro) para la respuesta hablada de "¿Cuándo es mi próximo turno?".
 * Los de hoy cuya hora ya pasó no cuentan. Nunca lanza: sin turno o ante un error, null.
 */
export async function proximoTurnoParaCharla(
  supabase: Cliente,
  usuarioId: string,
  ahoraHHMM: string
): Promise<TurnoProximo | null> {
  try {
    const hoy = fechaDeHoyISO();
    // Margen amplio: varios turnos de hoy ya pasados no pueden esconder el siguiente.
    const proximos = await turnosNucleo.listarProximos(supabase, usuarioId, 30);
    const t = elegirProximoTurno(proximos, hoy, ahoraHHMM);
    if (!t) return null;
    return {
      fecha: t.fecha,
      hora: t.hora.slice(0, 5),
      especialidad: t.especialidad,
      profesional: t.profesional?.trim() || null,
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
  // "Es hora de medirte…" sale solo del plan de monitoreo (`medirDeHoy`): acá no se inventa un horario.
  return { titulo: "Tus mediciones", items };
}


/**
 * Mediciones de hoy según los planes de monitoreo (un renglón por horario), para
 * el recordatorio "Es hora de medirte…" y "Tu rutina de hoy". Nunca lanza.
 */
export async function medirDeHoy(supabase: Cliente, usuarioId: string): Promise<MedirHoy[]> {
  try {
    const [planes, recientes] = await Promise.all([
      planesNucleo.listarSeguro(supabase, usuarioId),
      medicionesNucleo.listarRecientesSeguro(supabase, usuarioId),
    ]);
    if (planes.length === 0) return [];
    const hoy = fechaDeHoyISO();
    const deHoy = recientes.filter((m) => fechaISOEnAR(new Date(m.medido_at)) === hoy);
    return medirDelDia(planes, deHoy, diaSemanaDe(new Date()), hoy);
  } catch {
    return [];
  }
}

/** Turnos de HOY (todos, también los que ya pasaron) para "Tu rutina de hoy". Nunca lanza. */
export async function turnosDeHoy(supabase: Cliente, usuarioId: string): Promise<{ hora: string; especialidad: string; lugar: string | null }[]> {
  try {
    const hoy = fechaDeHoyISO();
    const proximos = await turnosNucleo.listarProximos(supabase, usuarioId, 10);
    return proximos
      .filter((t) => t.fecha === hoy)
      .map((t) => ({ hora: t.hora.slice(0, 5), especialidad: t.especialidad, lugar: t.lugar?.trim() || null }));
  } catch {
    return [];
  }
}
