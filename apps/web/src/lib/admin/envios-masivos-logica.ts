// Envíos masivos de push desde el panel (migración 047). Módulo puro: validación del formulario, ventana de límite y
// decisiones del procesamiento por lotes del cron.

import { CUERPO_PUSH_MAX, TITULO_PUSH_MAX } from "./push-form";

export const ENLACE_POR_DEFECTO = "/app/avisos";
export const ENLACE_MAX = 200;
/** Un envío masivo cada 10 minutos en total (lo hace cumplir `crear_envio_masivo`; esto es para mensajes y tests). */
export const VENTANA_ENVIO_MS = 10 * 60_000;

/**
 * Ruta interna de la app. Tiene que empezar con "/app" (exacto, o seguido de "/", "?" o "#"), sin protocolo ni host
 * ("//", "https:"), sin "..", sin barras invertidas ni espacios o caracteres de control. Vacío = el centro de avisos.
 */
export function validarEnlaceInterno(crudo: unknown): { ok: true; enlace: string } | { ok: false; error: string } {
  const texto = typeof crudo === "string" ? crudo.trim() : "";
  if (texto === "") return { ok: true, enlace: ENLACE_POR_DEFECTO };
  if (texto.length > ENLACE_MAX) return { ok: false, error: `El enlace admite hasta ${ENLACE_MAX} caracteres.` };
  const interno = /^\/app(?:[/?#][^\s\\]*)?$/.test(texto);
  const sospechoso = texto.includes("//") || texto.includes("..") || /[\u0000-\u001f\u007f]/.test(texto);
  if (!interno || sospechoso) return { ok: false, error: 'El enlace tiene que ser una ruta de la app que empiece con "/app".' };
  return { ok: true, enlace: texto };
}

export type EnvioMasivoForm = { titulo: string; cuerpo: string; enlace: string };

export function validarEnvioMasivo(crudo: {
  titulo: unknown;
  cuerpo: unknown;
  enlace: unknown;
}): { ok: true; envio: EnvioMasivoForm } | { ok: false; error: string } {
  const titulo = typeof crudo.titulo === "string" ? crudo.titulo.trim() : "";
  const cuerpo = typeof crudo.cuerpo === "string" ? crudo.cuerpo.trim() : "";
  if (titulo === "") return { ok: false, error: "Escribí un título." };
  if (titulo.length > TITULO_PUSH_MAX) return { ok: false, error: `El título admite hasta ${TITULO_PUSH_MAX} caracteres.` };
  if (cuerpo === "") return { ok: false, error: "Escribí el mensaje." };
  if (cuerpo.length > CUERPO_PUSH_MAX) return { ok: false, error: `El mensaje admite hasta ${CUERPO_PUSH_MAX} caracteres.` };
  const enlace = validarEnlaceInterno(crudo.enlace);
  if (!enlace.ok) return enlace;
  return { ok: true, envio: { titulo, cuerpo, enlace: enlace.enlace } };
}

/** Segundos que faltan para poder crear otro envío, o 0 si ya se puede. `ultimoCreadoMs` = el último no cancelado. */
export function esperaEnvioSeg(ultimoCreadoMs: number | null, ahoraMs: number): number {
  if (ultimoCreadoMs === null) return 0;
  const falta = ultimoCreadoMs + VENTANA_ENVIO_MS - ahoraMs;
  return falta > 0 ? Math.ceil(falta / 1000) : 0;
}

export function textoEspera(segundos: number): string {
  if (segundos <= 60) return "menos de un minuto";
  const min = Math.ceil(segundos / 60);
  return `${min} minutos`;
}

export type EstadoEnvio = "pendiente" | "enviando" | "terminado" | "cancelado";
export const ESTADOS_ENVIO: readonly EstadoEnvio[] = ["pendiente", "enviando", "terminado", "cancelado"];

export function esEstadoEnvio(v: unknown): v is EstadoEnvio {
  return typeof v === "string" && (ESTADOS_ENVIO as readonly string[]).includes(v);
}

/** Porcentaje de usuarios procesados (0..100). Un envío terminado siempre es 100. */
export function porcentajeEnvio(e: { estado: EstadoEnvio; totalUsuarios: number; usuariosProcesados: number }): number {
  if (e.estado === "terminado") return 100;
  if (e.totalUsuarios <= 0) return 0;
  return Math.min(100, Math.floor((100 * Math.max(0, e.usuariosProcesados)) / e.totalUsuarios));
}

// --- Procesamiento por lotes (cron) ---------------------------------------------------------------------

/** Usuarios por lote reclamado. Cada usuario tiene pocos dispositivos; los envíos de un lote van en paralelo. */
export const USUARIOS_POR_LOTE = 20;
/** Lotes máximos por tick del cron. */
export const LOTES_MAX_POR_TICK = 5;
/** Presupuesto total de la función del cron (Netlify corta a ~10 s) y margen mínimo para arrancar otro lote. */
export const PRESUPUESTO_CRON_MS = 9_000;
/** Un lote puede tardar hasta el timeout de un envío push (10 s) en el peor caso: no se empieza si falta menos. */
export const MARGEN_NUEVO_LOTE_MS = 4_000;

/** ¿Se puede reclamar otro lote? `desdeInicioCronMs` es lo que lleva corriendo toda la ruta, no solo los envíos. */
export function puedeReclamarOtroLote(desdeInicioCronMs: number, lotesHechos: number): boolean {
  if (lotesHechos >= LOTES_MAX_POR_TICK) return false;
  return PRESUPUESTO_CRON_MS - desdeInicioCronMs >= MARGEN_NUEVO_LOTE_MS;
}

export type ResultadoLote = { usuarios: number; enviados: number; fallidos: number };

export function sumarLotes(lotes: readonly ResultadoLote[]): ResultadoLote {
  return lotes.reduce(
    (a, l) => ({ usuarios: a.usuarios + l.usuarios, enviados: a.enviados + l.enviados, fallidos: a.fallidos + l.fallidos }),
    { usuarios: 0, enviados: 0, fallidos: 0 },
  );
}
