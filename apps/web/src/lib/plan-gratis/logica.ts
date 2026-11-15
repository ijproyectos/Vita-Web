// Límites del plan gratis (cuentas SIN vita+). Módulo PURO (sin `server-only`, sin I/O): lo usan el servidor, la UI
// y los tests. Decisión del dueño (2026-11-15). El estado "tiene vita+" se lee SIEMPRE con `esVitaPlus` /
// `es_vita_plus_de` (ver ./nucleo.ts); acá solo vive la aritmética y los textos.

/** Respuestas con vita por día (día calendario de Argentina). Se combina con el límite configurado: min(5, configurado). */
export const LIMITE_CHAT_GRATIS = 5;
/** Conteos de pastillas con foto (IA) por mes calendario de Argentina y por persona. */
export const CONTEOS_FOTO_MES_GRATIS = 1;
/** Estudios médicos cargados por mes calendario de Argentina y por persona. */
export const ESTUDIOS_MES_GRATIS = 1;
/** Cuidadores por persona en total (aceptados + invitaciones pendientes vigentes). */
export const CUIDADORES_GRATIS = 1;

export const RUTA_VITA_PLUS = "/app/vita-plus";

// Argentina no tiene horario de verano: UTC-3 fijo (mismo criterio que fechaISOEnAR en lib/rutina y el límite de pedidos).
const OFFSET_AR_MS = 3 * 3_600_000;

/** Instante en que empieza el mes calendario de Argentina que contiene `ahora` (00:00 AR del día 1). */
export function inicioMesAR(ahora: Date): Date {
  const ar = new Date(ahora.getTime() - OFFSET_AR_MS);
  return new Date(Date.UTC(ar.getUTCFullYear(), ar.getUTCMonth(), 1) + OFFSET_AR_MS);
}

/** Instante en que empieza el mes siguiente (cuando se renueva la cuota mensual). */
export function inicioMesSiguienteAR(ahora: Date): Date {
  const ar = new Date(ahora.getTime() - OFFSET_AR_MS);
  return new Date(Date.UTC(ar.getUTCFullYear(), ar.getUTCMonth() + 1, 1) + OFFSET_AR_MS);
}

/**
 * ¿Aplica el plan vita+ para una persona? Regla de las funciones por persona (conteo por foto, estudios, cuidadores):
 * cuenta el vita+ de la propia persona O el de cualquiera de sus Admin aceptados (un perfil gestionado no puede pagar).
 * La SQL equivalente es `es_vita_plus_de` (migración 061).
 */
export function planAplicable(estado: { propioPlus: boolean; adminsPlus: boolean[] }): "plus" | "gratis" {
  return estado.propioPlus || estado.adminsPlus.some(Boolean) ? "plus" : "gratis";
}

/** Límite diario de respuestas de chat: vita+ = el configurado; gratis = min(5, configurado). */
export function limiteChatEfectivo(args: { plus: boolean; configurado: number }): number {
  const c = Number.isFinite(args.configurado) && args.configurado > 0 ? Math.floor(args.configurado) : 0;
  return args.plus ? c : Math.min(LIMITE_CHAT_GRATIS, c);
}

export type CuotaMensual =
  | { limitada: false }
  | { limitada: true; limite: number; usados: number; restantes: number; alcanzada: boolean };

/** Cuota de una función mensual para una cuenta gratis. `plus` = sin tope. */
export function cuotaMensual(args: { plus: boolean; usados: number; limite: number }): CuotaMensual {
  if (args.plus) return { limitada: false };
  const usados = Number.isFinite(args.usados) && args.usados > 0 ? Math.floor(args.usados) : 0;
  const restantes = Math.max(0, args.limite - usados);
  return { limitada: true, limite: args.limite, usados, restantes, alcanzada: restantes === 0 };
}

export type CupoCuidadores =
  | { limitado: false }
  | { limitado: true; maximo: number; usados: number; alcanzado: boolean };

/** Cupo de cuidadores de una persona. `usados` = aceptados + pendientes vigentes. */
export function cupoCuidadores(args: { plus: boolean; usados: number }): CupoCuidadores {
  if (args.plus) return { limitado: false };
  const usados = Number.isFinite(args.usados) && args.usados > 0 ? Math.floor(args.usados) : 0;
  return { limitado: true, maximo: CUIDADORES_GRATIS, usados, alcanzado: usados >= CUIDADORES_GRATIS };
}

/** La función o la tabla no existe (migración sin aplicar): los límites fallan ABIERTO. */
export function rpcInexistente(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return (
    error.code === "PGRST202" ||
    error.code === "42883" ||
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /could not find the (function|table)/i.test(error.message ?? "")
  );
}

// --- Textos (español neutro, sin tecnicismos) ---

export function textoCuotaConteos(c: CuotaMensual): string | null {
  if (!c.limitada) return null;
  return c.alcanzada ? "Este mes ya usaste tu conteo con foto del plan gratis." : `Te queda ${c.restantes} conteo con foto este mes.`;
}

export function textoCuotaEstudios(c: CuotaMensual): string | null {
  if (!c.limitada) return null;
  return c.alcanzada ? "Este mes ya cargaste tu estudio del plan gratis." : `Te queda ${c.restantes} estudio para cargar este mes.`;
}

export const MENSAJE_LIMITE_CUIDADORES =
  "El plan gratis incluye 1 cuidador por persona. Con vita+ podés sumar todos los que quieras.";

export const MENSAJE_LIMITE_CONTEOS =
  "Este mes ya usaste tu conteo con foto del plan gratis. Podés cargar la cantidad a mano, o pasarte a vita+ para contar sin tope.";

export const MENSAJE_LIMITE_ESTUDIOS =
  "Este mes ya cargaste tu estudio del plan gratis. Con vita+ podés cargar todos los que necesites.";
