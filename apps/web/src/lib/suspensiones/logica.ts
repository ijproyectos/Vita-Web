// Suspensión de cuentas (migración 047). Módulo puro: sin Next ni Supabase, para poder usarlo desde el cliente y testearlo.

export const MOTIVOS_SUSPENSION = ["mal_uso", "falta_de_pago"] as const;
export type MotivoSuspension = (typeof MOTIVOS_SUSPENSION)[number];

export const NOTA_SUSPENSION_MAX = 300;

/** Etiqueta para el panel (quien administra). */
export const ETIQUETA_MOTIVO: Record<MotivoSuspension, string> = {
  mal_uso: "Mal uso",
  falta_de_pago: "Falta de pago",
};

/** Frase para la persona suspendida, en palabras simples. */
export const FRASE_MOTIVO: Record<MotivoSuspension, string> = {
  mal_uso: "por uso indebido de la app",
  falta_de_pago: "por falta de pago",
};

export function esMotivoSuspension(v: unknown): v is MotivoSuspension {
  return v === "mal_uso" || v === "falta_de_pago";
}

export type SuspensionActiva = { motivo: MotivoSuspension; desde: string | null };

/** Fila de `mi_suspension()`; null si no hay suspensión activa o la fila no se entiende. */
export function leerMiSuspension(data: unknown): SuspensionActiva | null {
  const fila = Array.isArray(data) ? data[0] : data;
  if (typeof fila !== "object" || fila === null) return null;
  const f = fila as Record<string, unknown>;
  if (!esMotivoSuspension(f.ms_motivo)) return null;
  return { motivo: f.ms_motivo, desde: typeof f.ms_desde === "string" ? f.ms_desde : null };
}

export type DecisionSuspensionApp = { accion: "seguir" } | { accion: "bloquear"; motivo: MotivoSuspension };

/**
 * Qué hace la app con la consulta de suspensión. FALLA ABIERTO a propósito: si no se puede consultar (migración sin
 * aplicar, base lenta) no se bloquea a nadie por un error nuestro; la otra capa (el ban de Supabase Auth) sigue
 * impidiendo iniciar sesión y renovarla.
 */
export function decidirSuspensionApp(resultado: { suspension: SuspensionActiva | null; fallo: boolean }): DecisionSuspensionApp {
  if (resultado.fallo || !resultado.suspension) return { accion: "seguir" };
  return { accion: "bloquear", motivo: resultado.suspension.motivo };
}

export type ValidacionSuspension =
  | { ok: true; motivo: MotivoSuspension; nota: string }
  | { ok: false; mensaje: string };

export function validarSuspension(crudo: { motivo: unknown; nota: unknown }): ValidacionSuspension {
  if (!esMotivoSuspension(crudo.motivo)) return { ok: false, mensaje: "Elegí el motivo de la suspensión." };
  const nota = typeof crudo.nota === "string" ? crudo.nota.trim() : "";
  if (nota.length > NOTA_SUSPENSION_MAX) return { ok: false, mensaje: `La nota admite hasta ${NOTA_SUSPENSION_MAX} caracteres.` };
  return { ok: true, motivo: crudo.motivo, nota };
}

export type ResultadoGuardiaSuspension = { ok: true } | { ok: false; razon: "dueno" | "administrador"; mensaje: string };

/**
 * Nunca se suspende a un dueño ni a un administrador activo (se perdería el acceso al panel). Los emails vienen ya
 * normalizados: `duenos` de ADMIN_EMAILS, `administradores` de la tabla.
 */
export function puedeSuspender(
  emailObjetivo: string | null | undefined,
  duenos: readonly string[],
  administradores: readonly string[],
): ResultadoGuardiaSuspension {
  const email = emailObjetivo?.trim().toLowerCase();
  if (!email) return { ok: true };
  if (duenos.includes(email)) return { ok: false, razon: "dueno", mensaje: "No se puede suspender a un dueño del panel." };
  if (administradores.includes(email)) return { ok: false, razon: "administrador", mensaje: "No se puede suspender a un administrador del panel." };
  return { ok: true };
}

/** `ban_duration` de la Auth Admin API de Supabase: ~100 años para suspender, 'none' para reactivar. */
export const BAN_SUSPENDER = "876000h";
export const BAN_LEVANTAR = "none";
