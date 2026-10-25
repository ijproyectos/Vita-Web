// Presupuesto de tiempo de una respuesta del chat: matemática pura (sin I/O ni `server-only`) para
// poder testearla cuando haya runner. Todos los tiempos son milisegundos de `performance.now()`.

/**
 * Tiempo total que se le da a una respuesta del chat, contado desde que entra el request.
 *
 * OJO: el límite REAL de una función en Netlify depende del plan y NO está verificado acá. Lo que
 * muestran hilos de la comunidad: ~10 s por defecto y ~26 s si se sube (plan/ajuste del sitio). Con un
 * límite real menor a este presupuesto, la plataforma corta la función antes que nosotros. Antes de
 * confiar en los 25 s hay que confirmar el límite del sitio `vitappweb` en Netlify.
 */
export const PRESUPUESTO_RESPUESTA_MS = 25_000;

/**
 * `maxDuration` (segundos) que declaran las rutas. Next exige un literal estático en cada `route.ts`
 * (no se puede importar), así que este valor se repite a mano allá: mantenerlos alineados. Va un poco
 * por encima del presupuesto para que el cierre prolijo (nota, guardado, `after`) entre.
 */
export const MAX_DURATION_SEGUNDOS = 30;

/** Reserva al final del presupuesto para cerrar el stream y guardar el mensaje. */
export const MARGEN_CIERRE_MS = 2_000;

/** Si queda menos que esto no se arranca otra vuelta del modelo (una vuelta típica tarda varios segundos). */
export const MINIMO_PARA_OTRA_VUELTA_MS = 8_000;

/** Reintentos internos del SDK de Anthropic: pocos, para que quepan dentro del presupuesto. */
export const REINTENTOS_SDK = 1;

/**
 * Holgura que se suma al timeout propio del SDK: el único que decide cuándo se corta es el
 * AbortController de la ruta (a `msHastaElCorte`); el timeout del SDK queda como red de seguridad
 * claramente posterior, para que nunca gane la carrera y dispare un reintento o un error genérico.
 */
export const HOLGURA_TIMEOUT_SDK_MS = 3_000;

/** Piso del timeout por llamada, para no pasarle 0 o un negativo al SDK. */
const TIMEOUT_MINIMO_MS = 1_000;

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

/** ¿Alcanza el tiempo restante para arrancar otra vuelta del modelo? */
export function alcanzaParaOtraVuelta(restante: number): boolean {
  return restante >= MINIMO_PARA_OTRA_VUELTA_MS;
}

/** Nota que se agrega cuando se corta por tiempo; si ya se guardó algo, lo aclara. */
export function textoCortePorTiempo(escriturasHechas: number): string {
  const base = "Se me hizo largo, te respondo hasta acá. Si falta algo, preguntame de nuevo.";
  return escriturasHechas > 0 ? `${base} Lo que alcancé a guardar ya quedó guardado.` : base;
}
