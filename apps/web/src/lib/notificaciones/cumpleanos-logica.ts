import { esCumpleHoy } from "@/lib/onboarding/nacimiento";
import type { PreferenciasAvisos } from "./avisos-tipos";

// Reglas PURAS del saludo de cumpleaños (cron, Home y chat usan las mismas).
//
//   tipo (envios_avisos)     ventana (hora AR)   quién lo recibe
//   cumpleanos               09:00-11:59         la persona, sin silencio nocturno
//   cumpleanos_persona       09:00-11:59         cada cuidador aceptado con "Resumen del día" prendido
//
// La ventana arranca a las 09:00 y dura 3 h: si un tick falla o el silencio
// nocturno de alguien termina tarde, el aviso igual sale una vez (el dedupe
// `reclamarEnvio` es por (tipo, ref, fecha AR)). Solo hay saludo con fecha de
// nacimiento COMPLETA (esCumpleHoy ignora año/edad sueltos); quien nació un 29
// de febrero lo celebra el 28 en los años no bisiestos.

export function enVentanaCumpleanos(horaAR: string): boolean {
  return horaAR >= "09:00" && horaAR < "12:00";
}

type PerfilCumple = { id: string; nombre: string | null; fecha_nacimiento: string | null };

/** Los perfiles que cumplen años hoy (fecha AR), con la edad que cumplen. */
export function cumpleanerosDeHoy<T extends PerfilCumple>(perfiles: T[], hoyAR: string): (T & { cumple: number })[] {
  const anioHoy = Number(hoyAR.slice(0, 4));
  return perfiles
    .filter((p) => esCumpleHoy(p.fecha_nacimiento, hoyAR))
    .map((p) => ({ ...p, cumple: anioHoy - Number((p.fecha_nacimiento as string).slice(0, 4)) }));
}

/** El saludo propio no tiene toggle propio: solo respeta el silencio nocturno. */
export function personaRecibeCumple(silenciado: boolean): boolean {
  return !silenciado;
}

/** Al cuidador le llega con "Resumen del día" prendido (es el aviso de familia de uso diario) y fuera de su silencio. */
export function cuidadorRecibeCumple(prefs: Pick<PreferenciasAvisos, "resumen_dia">, silenciado: boolean): boolean {
  return !silenciado && prefs.resumen_dia;
}
