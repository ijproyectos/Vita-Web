// Evaluador determinístico y cuentas de costo del set de evals. Puro: sin red ni lectura de entorno.
import { TOOLS_DE_ESCRITURA } from "@/lib/ai/destino";
import type { CasoEval, RespuestaEval, ResultadoCaso } from "./tipos";

const texto = (v: unknown): string => (typeof v === "string" ? v : JSON.stringify(v ?? ""));

/** Aplica las expectativas del caso a lo que hizo el modelo. Devuelve las fallas (vacío = pasó). */
export function evaluarCaso(caso: CasoEval, r: RespuestaEval): ResultadoCaso {
  const e = caso.espera;
  const fallas: string[] = [];
  const nombres = r.llamadas.map((l) => l.nombre);

  for (const t of e.llama ?? []) if (!nombres.includes(t)) fallas.push(`no llamó a ${t}`);
  for (const t of e.noLlama ?? []) if (nombres.includes(t)) fallas.push(`llamó a ${t} y no debía`);
  if (e.noEscribe) {
    const escritas = nombres.filter((n) => TOOLS_DE_ESCRITURA.has(n));
    if (escritas.length) fallas.push(`escribió (${escritas.join(", ")}) y no debía`);
  }
  for (const [t, min] of Object.entries(e.minLlamadas ?? {})) {
    const n = nombres.filter((x) => x === t).length;
    if (n < min) fallas.push(`llamó a ${t} ${n} vez/veces, se esperaban al menos ${min}`);
  }
  for (const a of e.argumentos ?? []) {
    const ok = r.llamadas.some(
      (l) => l.nombre === a.tool && Object.entries(a.contiene).every(([campo, re]) => re.test(texto(l.input[campo])))
    );
    if (!ok) fallas.push(`ninguna llamada a ${a.tool} cumple ${Object.keys(a.contiene).join(", ")}`);
  }
  for (const p of e.entradaProhibida ?? []) {
    if (r.llamadas.some((l) => l.nombre === p.tool && p.regex.test(JSON.stringify(l.input)))) {
      fallas.push(`entrada prohibida en ${p.tool}: ${p.regex}`);
    }
  }
  for (const re of e.texto ?? []) if (!re.test(r.texto)) fallas.push(`el texto no cumple ${re}`);
  for (const re of e.sinTexto ?? []) if (re.test(r.texto)) fallas.push(`el texto contiene lo prohibido ${re}`);
  const propia = e.custom?.(r);
  if (propia) fallas.push(propia);

  return { id: caso.id, ok: fallas.length === 0, aspiracional: !!caso.aspiracional, fallas };
}

/** Cuenta como error solo lo que no es aspiracional. */
export function hayErrores(resultados: ResultadoCaso[]): boolean {
  return resultados.some((x) => !x.ok && !x.aspiracional);
}

// --- Costo (Claude Sonnet 5, USD por millón de tokens) ---
export const PRECIO_ENTRADA = 2;
export const PRECIO_SALIDA = 10;
export const PRECIO_CACHE_LECTURA = 0.2;
export const PRECIO_CACHE_ESCRITURA = PRECIO_ENTRADA * 1.25;

export type UsoEval = { input: number; output: number; cacheLectura: number; cacheEscritura: number };

export function costoUSD(u: UsoEval): number {
  return (
    (u.input * PRECIO_ENTRADA + u.output * PRECIO_SALIDA + u.cacheLectura * PRECIO_CACHE_LECTURA + u.cacheEscritura * PRECIO_CACHE_ESCRITURA) /
    1_000_000
  );
}

/**
 * Cota superior del costo de UN caso: cada vuelta (hasta `vueltas`) escribe todo el prefijo en
 * caché a 1.25x y genera `maxSalida` tokens. Es deliberadamente pesimista; el real suele ser mucho menor.
 */
export function cotaSuperiorCaso(tokensPrefijo: number, maxSalida: number, vueltas: number): number {
  return costoUSD({ input: 0, output: maxSalida * vueltas, cacheLectura: 0, cacheEscritura: tokensPrefijo * vueltas });
}
