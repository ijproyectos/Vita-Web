// Códigos de vita+ (migración 046). Módulo puro, sin `server-only`: lo usan el servidor, el panel y los tests.
// Un código se GENERA en el servidor, se muestra una sola vez y solo se guarda su hash sha256 + los últimos 4.

import { createHmac, randomBytes } from "node:crypto";

export type TipoCodigo = "plus" | "admin";

export const DIAS_CODIGO_PLUS = 15;
export const USOS_MAX_LIMITE = 10_000;
export const CANTIDAD_MAX_POR_LOTE = 20;

/** 32 símbolos sin 0/O/1/I: ni se confunden al dictarlos ni sesgan el módulo (256 / 32 es exacto). */
export const ALFABETO_CODIGO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const LARGO_CUERPO = 8;
const PREFIJO = "VITA";

/** Quita todo lo que no sea letra o número y pasa a mayúsculas: "vita xxxx-xxxx" -> "VITAXXXXXXXX". */
export function normalizarCodigo(crudo: string): string {
  return crudo.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** ¿Tiene la forma de un código nuestro? (evita golpear la base con basura) */
export function tieneFormaDeCodigo(normalizado: string): boolean {
  if (normalizado.length !== PREFIJO.length + LARGO_CUERPO || !normalizado.startsWith(PREFIJO)) return false;
  const cuerpo = normalizado.slice(PREFIJO.length);
  return [...cuerpo].every((c) => ALFABETO_CODIGO.includes(c));
}

/**
 * Secreto con el que se firman los hashes de los códigos: `VITA_PLUS_CODIGOS_SECRET`, o `SUPABASE_SERVICE_ROLE_KEY`
 * si no está. Tiene que ser ESTABLE: rotarlo invalida todos los códigos todavía no canjeados.
 */
export function leerSecretoCodigos(env: Record<string, string | undefined> = process.env): string | null {
  const propio = env.VITA_PLUS_CODIGOS_SECRET?.trim();
  if (propio) return propio;
  const respaldo = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return respaldo || null;
}

/** HMAC-SHA256 hex del código normalizado: con 40 bits de código, un hash sin clave se fuerza offline si la tabla se filtra. */
export function hashCodigo(normalizado: string, secreto: string): string {
  return createHmac("sha256", secreto).update(normalizado, "utf8").digest("hex");
}

/** "VITAABCD2345" -> "VITA-ABCD-2345". */
export function formatearCodigo(normalizado: string): string {
  return `${normalizado.slice(0, 4)}-${normalizado.slice(4, 8)}-${normalizado.slice(8, 12)}`;
}

export function ultimos4(normalizado: string): string {
  return normalizado.slice(-4);
}

/** Genera un código con aleatoriedad criptográfica. `fuente` se inyecta solo en los tests. */
export function generarCodigo(fuente: (n: number) => Uint8Array = (n) => randomBytes(n)): string {
  const bytes = fuente(LARGO_CUERPO);
  let cuerpo = "";
  for (let i = 0; i < LARGO_CUERPO; i++) cuerpo += ALFABETO_CODIGO[bytes[i] & 31];
  return formatearCodigo(PREFIJO + cuerpo);
}

// --- Vigencia -----------------------------------------------------------------------------------------

const MS_DIA = 86_400_000;

export type VigenciaCodigo = { venceAt: number | null; permanente: boolean };

/**
 * Espejo de la cuenta que hace `canjear_codigo_vita_plus`: 'plus' suma `dias` desde el mayor entre ahora y el
 * vencimiento actual (canjear antes no pierde tiempo); 'admin' vuelve la cuenta permanente. La base es la fuente de
 * verdad; esto sirve para los tests y para mostrar la fecha esperada.
 */
export function calcularVigencia(args: {
  tipo: TipoCodigo;
  dias: number | null;
  actual: { venceAt: number | null; permanente: boolean } | null;
  ahoraMs: number;
}): VigenciaCodigo {
  const { tipo, dias, actual, ahoraMs } = args;
  if (tipo === "admin") return { venceAt: actual?.venceAt ?? ahoraMs, permanente: true };
  const base = Math.max(ahoraMs, actual?.venceAt ?? 0);
  return { venceAt: base + (dias ?? DIAS_CODIGO_PLUS) * MS_DIA, permanente: actual?.permanente ?? false };
}

// --- Estado de un código (panel) ----------------------------------------------------------------------

export type EstadoCodigo = "activo" | "agotado" | "vencido" | "revocado";

export function estadoCodigo(c: { revocadoAt: string | null; usos: number; usosMax: number; venceCodigoAt: string | null }, ahoraMs: number): EstadoCodigo {
  if (c.revocadoAt) return "revocado";
  if (c.venceCodigoAt && Date.parse(c.venceCodigoAt) <= ahoraMs) return "vencido";
  if (c.usos >= c.usosMax) return "agotado";
  return "activo";
}

// --- Resultado del canje --------------------------------------------------------------------------------

export type ResultadoCanje = "ok" | "invalido" | "revocado" | "vencido" | "agotado" | "ya_canjeado" | "ya_permanente";

const RESULTADOS: readonly string[] = ["ok", "invalido", "revocado", "vencido", "agotado", "ya_canjeado", "ya_permanente"];

export function esResultadoCanje(v: unknown): v is ResultadoCanje {
  return typeof v === "string" && RESULTADOS.includes(v);
}

export const MENSAJE_CODIGO_INVALIDO = "Código inválido o vencido.";

/** Mensaje al usuario: genérico a propósito (no revela si el código existe, está agotado o revocado). */
export function mensajeCanje(r: ResultadoCanje): string {
  switch (r) {
    case "ya_canjeado":
      return "Ya canjeaste este código.";
    case "ya_permanente":
      return "Ya tenés vita+ sin vencimiento.";
    default:
      return MENSAJE_CODIGO_INVALIDO;
  }
}

// --- Freno de intentos -------------------------------------------------------------------------

export const MAX_FALLOS_CANJE = 5;
export const VENTANA_FALLOS_CANJE_MS = 15 * 60_000;
export const MENSAJE_DEMASIADOS_INTENTOS = "Demasiados intentos. Probá de nuevo en unos minutos.";

/** Comienzo de la ventana fija de 15 minutos (para la tabla `limites_pedidos`). */
export function inicioVentanaCanje(ahoraMs: number): Date {
  return new Date(Math.floor(ahoraMs / VENTANA_FALLOS_CANJE_MS) * VENTANA_FALLOS_CANJE_MS);
}

export function claveFallosCanje(usuarioId: string): string {
  return `canje:u:${usuarioId}:15min`;
}

/** `cuenta` = intentos de la ventana INCLUIDO el actual (incremento atómico y después chequeo). */
export function bloqueadoPorFallos(cuenta: number): boolean {
  return cuenta > MAX_FALLOS_CANJE;
}

// --- Alta de códigos desde el panel ---------------------------------------------------------------------

export type EntradaAltaCodigos = { tipo: TipoCodigo; usosMax: number; venceCodigoAt: string | null; cantidad: number };

/** Valida el formulario del panel. `vence` llega como "YYYY-MM-DD" (fin de ese día en hora argentina). */
export function validarAltaCodigos(
  crudo: { tipo: unknown; usosMax: unknown; vence: unknown; cantidad: unknown },
  ahoraMs: number,
): { ok: true; datos: EntradaAltaCodigos } | { ok: false; mensaje: string } {
  if (crudo.tipo !== "plus" && crudo.tipo !== "admin") return { ok: false, mensaje: "Elegí el tipo de código." };
  const usosMax = Number(crudo.usosMax);
  if (!Number.isInteger(usosMax) || usosMax < 1 || usosMax > USOS_MAX_LIMITE) {
    return { ok: false, mensaje: `Los usos máximos van de 1 a ${USOS_MAX_LIMITE}.` };
  }
  const cantidad = Number(crudo.cantidad);
  if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > CANTIDAD_MAX_POR_LOTE) {
    return { ok: false, mensaje: `Podés generar de 1 a ${CANTIDAD_MAX_POR_LOTE} códigos por vez.` };
  }
  let venceCodigoAt: string | null = null;
  if (typeof crudo.vence === "string" && crudo.vence.trim() !== "") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(crudo.vence.trim())) return { ok: false, mensaje: "La fecha de vencimiento no es válida." };
    // Fin del día argentino (UTC-3 fijo): 23:59:59 AR = 02:59:59 UTC del día siguiente.
    const finDia = Date.parse(`${crudo.vence.trim()}T23:59:59-03:00`);
    if (!Number.isFinite(finDia)) return { ok: false, mensaje: "La fecha de vencimiento no es válida." };
    if (finDia <= ahoraMs) return { ok: false, mensaje: "El vencimiento del código tiene que ser futuro." };
    venceCodigoAt = new Date(finDia).toISOString();
  }
  return { ok: true, datos: { tipo: crudo.tipo, usosMax, venceCodigoAt, cantidad } };
}

export const ETIQUETA_TIPO_CODIGO: Record<TipoCodigo, string> = {
  plus: "vita plus · 15 días",
  admin: "vita admin · sin vencimiento",
};

export type OrigenVitaPlus = "pago" | "codigo_plus" | "codigo_admin";

export const ETIQUETA_ORIGEN: Record<OrigenVitaPlus, string> = {
  pago: "Pago",
  codigo_plus: "Código plus",
  codigo_admin: "Código admin",
};

export function esOrigenVitaPlus(v: unknown): v is OrigenVitaPlus {
  return v === "pago" || v === "codigo_plus" || v === "codigo_admin";
}
