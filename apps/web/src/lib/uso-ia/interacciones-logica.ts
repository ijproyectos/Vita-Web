// Límite diario de INTERACCIONES (consultas) con vita. Módulo puro (sin `server-only`): lo usan el chat, la UI y el
// panel. Decisión del dueño (2026-11-06): 15 por día para todas las personas (también con vita+); un administrador
// puede cambiar el límite de una persona. Es un tope ADICIONAL al límite diario en dólares (./limite.ts).

import { CORREO_SOPORTE } from "@/lib/legal/datos";

export const LIMITE_INTERACCIONES_DIARIO_DEFAULT = 15;
export const LIMITE_INTERACCIONES_MIN = 1;
export const LIMITE_INTERACCIONES_MAX = 1000;
export const MOTIVO_LIMITE_MAX = 200;

export type Consultas = { usadas: number; limite: number; restantes: number };

export function calcularConsultas(usadas: number, limite: number): Consultas {
  const u = Number.isFinite(usadas) && usadas > 0 ? Math.floor(usadas) : 0;
  const l = Number.isFinite(limite) && limite > 0 ? Math.floor(limite) : 0;
  return { usadas: u, limite: l, restantes: Math.max(0, l - u) };
}

/**
 * ¿Este turno gasta una interacción? Solo cuenta el turno que va a llamar al modelo. No cuenta:
 * - la confirmación por botón que el servidor resuelve sin modelo (`resueltoSinModelo`);
 * - el reintento de un turno cuyo mensaje ya había quedado guardado (el primer intento ya contó): `estadoPrevio`
 *   "guardado" o "desconocido" con `reintento`.
 * (El reintento ya respondido devuelve la respuesta guardada y ni llega acá.)
 */
export function turnoCuentaComoInteraccion(turno: {
  reintento: boolean;
  estadoPrevio: "nuevo" | "guardado" | "respondido" | "desconocido";
  resueltoSinModelo: boolean;
}): boolean {
  if (turno.resueltoSinModelo) return false;
  if (turno.estadoPrevio === "respondido") return false;
  if (turno.reintento && (turno.estadoPrevio === "guardado" || turno.estadoPrevio === "desconocido")) return false;
  return true;
}

/** Límite efectivo: el de la persona si es un entero válido, si no el general. */
export function resolverLimiteInteracciones(override: number | null | undefined): number {
  if (typeof override === "number" && Number.isInteger(override) && override >= LIMITE_INTERACCIONES_MIN && override <= LIMITE_INTERACCIONES_MAX) {
    return override;
  }
  return LIMITE_INTERACCIONES_DIARIO_DEFAULT;
}

export type ResultadoConsumo =
  | { permitido: true; consultas: Consultas | null }
  | { permitido: false; consultas: Consultas };

/**
 * Interpreta la respuesta de la RPC `consumir_interaccion`. FALLA ABIERTO: cualquier forma inesperada o error del
 * contador deja pasar el turno (una falla de contabilidad nunca bloquea el chat).
 */
export function interpretarConsumo(data: unknown, huboError: boolean): ResultadoConsumo {
  if (huboError) return { permitido: true, consultas: null };
  const fila = Array.isArray(data) ? data[0] : data;
  if (!fila || typeof fila !== "object") return { permitido: true, consultas: null };
  const f = fila as Record<string, unknown>;
  const usadas = Number(f.c_usadas);
  const limite = Number(f.c_limite);
  if (typeof f.c_permitido !== "boolean" || !Number.isFinite(usadas) || !Number.isFinite(limite)) {
    return { permitido: true, consultas: null };
  }
  const consultas = calcularConsultas(usadas, limite);
  if (f.c_permitido) return { permitido: true, consultas };
  return { permitido: false, consultas };
}

/** Mensaje al llegar al tope. El modo simple no usa palabras técnicas ni manda a escribir un correo. */
export function mensajeLimiteInteracciones(limite: number, modoSimple: boolean): string {
  if (modoSimple) return "Por hoy ya hablamos todo lo que podía. Mañana seguimos.";
  return `Llegaste a las ${limite} consultas de hoy con vita. Mañana a la medianoche se renueva. Si necesitás más, escribinos a ${CORREO_SOPORTE}.`;
}

/**
 * Eventos SSE cuando no queda cupo: sin llamar al modelo. Si el mensaje era una emergencia, el texto fijo de
 * emergencia (con los teléfonos) sale SIEMPRE primero, aunque la persona haya superado el límite.
 */
export function eventosPorLimiteInteracciones(params: {
  limite: number;
  modoSimple: boolean;
  textoEmergencia: string | null;
}): ({ chunk: string } | { error: string; sinReintento: true })[] {
  const eventos: ({ chunk: string } | { error: string; sinReintento: true })[] = [];
  if (params.textoEmergencia) eventos.push({ chunk: params.textoEmergencia });
  eventos.push({ error: mensajeLimiteInteracciones(params.limite, params.modoSimple), sinReintento: true });
  return eventos;
}

/** Texto corto del indicador, en palabras de todos los días. */
export function textoConsultasRestantes(c: Consultas): string {
  if (c.restantes <= 0) return "Llegaste al límite de consultas de hoy. Se renueva a la medianoche.";
  if (c.restantes === 1) return "Te queda 1 consulta hoy";
  return `Te quedan ${c.restantes} consultas hoy`;
}

/** Carga útil del evento SSE `{uso}`: los datos de dólares (porcentajes) y, si se conocen, las consultas. */
export function cargaUsoSSE(
  uso: { usados: number; limite: number; restantes: number; porcentajeUsado: number },
  consultas: Consultas | null
): { usados: number; limite: number; restantes: number; porcentajeUsado: number; consultas?: Consultas } {
  const base = { usados: uso.usados, limite: uso.limite, restantes: uso.restantes, porcentajeUsado: uso.porcentajeUsado };
  return consultas ? { ...base, consultas } : base;
}

export type ValidacionLimite =
  | { ok: true; limite: number | null; motivo: string }
  | { ok: false; mensaje: string };

/**
 * Valida el formulario del panel. `limite` vacío o "general" = volver al límite general (null). Nunca se confía en
 * lo que manda el cliente: se vuelve a validar en la Server Action y en la función SQL.
 */
export function validarLimiteAdmin(entrada: { limite: unknown; motivo: unknown; volverAlGeneral?: unknown }): ValidacionLimite {
  const motivo = typeof entrada.motivo === "string" ? entrada.motivo.trim() : "";
  if (motivo.length > MOTIVO_LIMITE_MAX) return { ok: false, mensaje: `El motivo tiene más de ${MOTIVO_LIMITE_MAX} caracteres.` };
  if (entrada.volverAlGeneral === true) return { ok: true, limite: null, motivo: "" };
  const crudo = typeof entrada.limite === "number" ? String(entrada.limite) : typeof entrada.limite === "string" ? entrada.limite.trim() : "";
  if (!/^\d{1,4}$/.test(crudo)) return { ok: false, mensaje: `Ingresá un número entero entre ${LIMITE_INTERACCIONES_MIN} y ${LIMITE_INTERACCIONES_MAX}.` };
  const n = Number(crudo);
  if (n < LIMITE_INTERACCIONES_MIN || n > LIMITE_INTERACCIONES_MAX) {
    return { ok: false, mensaje: `El límite tiene que estar entre ${LIMITE_INTERACCIONES_MIN} y ${LIMITE_INTERACCIONES_MAX}.` };
  }
  return { ok: true, limite: n, motivo };
}
