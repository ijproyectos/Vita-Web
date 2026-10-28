// Presupuesto de tiempo de una respuesta del chat: matemática pura (sin I/O ni `server-only`).
// Todos los tiempos son milisegundos de `performance.now()`.

import { usoDeAnthropic, type UsoTokens } from "@/lib/uso-ia/tipos";

/**
 * Tiempo total que se le da a una respuesta del chat, contado desde que entra el request.
 *
 * DEFAULT SEGURO: 9 s. Una función síncrona de Netlify corta a los ~10 s si el sitio no tiene
 * el timeout subido, así que con un presupuesto mayor la plataforma mataría la función antes que
 * nosotros y el usuario vería un corte sin mensaje. Con 9 s la respuesta ya va por streaming (el
 * texto sale apenas llega) y, si el modelo no alcanza, se cierra prolijo con una nota.
 *
 * PARA SUBIRLO (p. ej. 25 s): primero subir el timeout de funciones del sitio `vitappweb` en
 * Netlify (depende del plan; no está verificado) y recién después cambiar esta constante y los
 * literales `maxDuration` de las rutas (`/api/chat`, `/api/voz/*`: Next exige un literal estático
 * en cada `route.ts`, no se puede importar) para que queden >= PRESUPUESTO_RESPUESTA_MS / 1000.
 */
export const PRESUPUESTO_RESPUESTA_MS = 9_000;

/** Reserva al final del presupuesto para cerrar el stream y guardar el mensaje. */
export const MARGEN_CIERRE_MS = 1_000;

/** Reintentos internos del SDK de Anthropic: pocos, para que quepan dentro del presupuesto. */
export const REINTENTOS_SDK = 1;

/**
 * Holgura que se suma al timeout propio del SDK: el único que decide cuándo se corta es el
 * AbortController de la ruta (a `msHastaElCorte`); el timeout del SDK queda como red de seguridad
 * claramente posterior, para que nunca gane la carrera y dispare un reintento o un error genérico.
 */
export const HOLGURA_TIMEOUT_SDK_MS = 3_000;

/** Tope de cada llamada a un proveedor de voz (Groq/Deepgram): siempre dentro del presupuesto. */
export const TIMEOUT_PROVEEDOR_VOZ_MS = PRESUPUESTO_RESPUESTA_MS - 1_000;

/** Piso del timeout por llamada, para no pasarle 0 o un negativo al SDK. */
const TIMEOUT_MINIMO_MS = 1_000;

/** Techo del mínimo para arrancar otra vuelta del modelo. */
const MINIMO_OTRA_VUELTA_TECHO_MS = 8_000;

/** Cuánto queda del presupuesto (puede ser negativo si ya se pasó). */
export function restanteMs(inicioMs: number, ahoraMs: number, totalMs: number = PRESUPUESTO_RESPUESTA_MS): number {
  return totalMs - (ahoraMs - inicioMs);
}

/** Cuánto falta hasta el corte duro (deadline menos el margen de cierre), nunca menos que el piso. */
export function msHastaElCorte(inicioMs: number, ahoraMs: number, totalMs: number = PRESUPUESTO_RESPUESTA_MS): number {
  return Math.max(TIMEOUT_MINIMO_MS, restanteMs(inicioMs, ahoraMs, totalMs) - MARGEN_CIERRE_MS);
}

/** Timeout que se le pasa al SDK: siempre posterior al corte del AbortController. */
export function timeoutSdkMs(inicioMs: number, ahoraMs: number, totalMs: number = PRESUPUESTO_RESPUESTA_MS): number {
  return msHastaElCorte(inicioMs, ahoraMs, totalMs) + HOLGURA_TIMEOUT_SDK_MS;
}

/** Mínimo restante para arrancar otra vuelta del modelo: 30 % del presupuesto, con techo de 8 s. */
export function minimoParaOtraVueltaMs(totalMs: number = PRESUPUESTO_RESPUESTA_MS): number {
  return Math.min(MINIMO_OTRA_VUELTA_TECHO_MS, Math.round(totalMs * 0.3));
}

/** ¿Alcanza el tiempo restante para arrancar otra vuelta del modelo? */
export function alcanzaParaOtraVuelta(restante: number, totalMs: number = PRESUPUESTO_RESPUESTA_MS): boolean {
  return restante >= minimoParaOtraVueltaMs(totalMs);
}

/** Nota que se agrega cuando se corta por tiempo; si ya se guardó algo, lo aclara. */
export function textoCortePorTiempo(escriturasHechas: number): string {
  const base = "Se me hizo largo, te respondo hasta acá. Si falta algo, preguntame de nuevo.";
  return escriturasHechas > 0 ? `${base} Lo que alcancé a guardar ya quedó guardado.` : base;
}

/** Uso parcial de una llamada que se cortó (snapshot del stream), o ceros si no hay. */
export function usoParcial(
  mensaje: { usage?: Parameters<typeof usoDeAnthropic>[0] } | undefined
): UsoTokens {
  return usoDeAnthropic(mensaje?.usage);
}
