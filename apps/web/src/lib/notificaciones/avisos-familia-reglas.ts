import { createHash } from "node:crypto";
import type { PreferenciasAvisos } from "./avisos-tipos";

// Reglas PURAS de los avisos de familia (al cuidador, sobre una persona
// cuidada). Sin `server-only` ni acceso a datos a propósito: el cron las usa y
// se pueden ejercitar sueltas (ver supabase/tests/avisos-familia.sql y el
// script de decisiones del paquete 8).
//
//   tipo (envios_avisos)       ventana (hora AR)   quién lo recibe
//   resumen_dia_persona        21:00-21:59         todo cuidador con resumen_dia
//   turno_persona_dia_antes    20:00-22:59         todo cuidador con turnos_persona
//   stock_bajo_persona         09:00-20:59         cuidadores Admin con stock_persona
//   persona_en_vita            al instante         Admin, sin silencio (es un evento)
//
// Silencio nocturno (el del propio cuidador): aplica a resumen, turnos y stock,
// igual que a sus avisos propios de turnos y stock. NO aplica a "no tomó" /
// "ya tomó" (las tomas sin confirmar suenan igual, como dice el diseño) ni a
// "ya está en vita" (evento puntual, no se repite).

export type TipoAvisoFamilia = "resumen_dia_persona" | "turno_persona_dia_antes" | "stock_bajo_persona";
export type RolCuidador = "editar" | "ver";

export function enVentanaResumenDia(horaAR: string): boolean {
  return horaAR >= "21:00" && horaAR < "22:00";
}
export function enVentanaTurnoPersona(horaAR: string): boolean {
  return horaAR >= "20:00" && horaAR < "23:00";
}
export function enVentanaStockPersona(horaAR: string): boolean {
  return horaAR >= "09:00" && horaAR < "21:00";
}

/** ¿Este cuidador recibe este aviso de familia? (preferencias + rol + silencio). */
export function cuidadorRecibe(
  tipo: TipoAvisoFamilia,
  prefs: Pick<PreferenciasAvisos, "resumen_dia" | "turnos_persona" | "stock_persona">,
  rol: RolCuidador,
  silenciado: boolean
): boolean {
  if (silenciado) return false;
  switch (tipo) {
    case "resumen_dia_persona":
      return prefs.resumen_dia;
    case "turno_persona_dia_antes":
      return prefs.turnos_persona;
    case "stock_bajo_persona":
      return prefs.stock_persona && rol === "editar";
  }
}

/**
 * `envios_avisos` deduplica por (tipo, ref_id, fecha) y estos avisos son POR
 * CUIDADOR: el ref_id es un uuid determinista de las partes (persona,
 * cuidador, turno/inventario...). Mismo input => mismo uuid.
 */
export function refDeterminista(...partes: string[]): string {
  const h = createHash("sha256").update(partes.join("|")).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
