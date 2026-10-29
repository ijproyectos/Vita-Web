import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import * as turnosNucleo from "@/lib/turnos/nucleo";
import * as medicionesNucleo from "@/lib/mediciones/nucleo";
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
  const pendientes = items.filter((i) => i.pendiente).map((i) => (i.tipo === "presion" ? "la presión" : "el azúcar"));
  const titulo = pendientes.length > 0 ? `Es hora de medirte ${pendientes.join(" y ")}` : "Tus mediciones";
  return { titulo, items };
}

