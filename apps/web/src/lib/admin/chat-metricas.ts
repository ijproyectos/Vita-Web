// Agregación pura de `registros_chat` y `chat_valoraciones` para el panel /adminvita/chat. Sin `server-only`: la usan la
// página y los tests. Nunca maneja texto de mensajes: solo números, nombres de tools y códigos cortos.

import { fechaISOEnAR } from "@/lib/rutina/formato";
import { costoMicroUSD } from "@/lib/uso-ia/precios";

export type FilaRegistroChat = {
  created_at: string;
  version_prompt: string;
  modelo: string;
  latencia_ms: number;
  latencia_primer_token_ms: number | null;
  tools: string[];
  tokens_entrada: number;
  tokens_salida: number;
  tokens_cache_lectura: number;
  tokens_cache_escritura: number;
  resultado: string;
  error_codigo: string | null;
};

export type FilaValoracion = { valor: number; motivo: string | null; created_at: string; usuario_id: string };

export const PERIODOS_CHAT = [
  { clave: "24h", horas: 24, texto: "24 h" },
  { clave: "7d", horas: 24 * 7, texto: "7 días" },
  { clave: "30d", horas: 24 * 30, texto: "30 días" },
] as const;
export type ClavePeriodoChat = (typeof PERIODOS_CHAT)[number]["clave"];

export function periodoDe(crudo: string | undefined): (typeof PERIODOS_CHAT)[number] {
  return PERIODOS_CHAT.find((p) => p.clave === crudo) ?? PERIODOS_CHAT[1];
}

/** Percentil por rango más cercano (p entre 0 y 100) de los valores finitos; null si no hay ninguno. */
export function percentil(valores: readonly (number | null | undefined)[], p: number): number | null {
  const v = valores.filter((x): x is number => typeof x === "number" && Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const rango = Math.ceil((Math.min(Math.max(p, 0), 100) / 100) * v.length);
  return v[Math.max(rango, 1) - 1];
}

export function promedio(valores: readonly number[]): number | null {
  return valores.length === 0 ? null : valores.reduce((a, x) => a + x, 0) / valores.length;
}

/** Tokens de contexto de una respuesta: lo que se le mandó al modelo (entrada + lectura + escritura de caché). */
export function contextoTokens(f: Pick<FilaRegistroChat, "tokens_entrada" | "tokens_cache_lectura" | "tokens_cache_escritura">): number {
  return f.tokens_entrada + f.tokens_cache_lectura + f.tokens_cache_escritura;
}

export function costoUsdDeFila(f: FilaRegistroChat): number {
  return (
    costoMicroUSD(f.modelo, {
      input: f.tokens_entrada,
      output: f.tokens_salida,
      cacheRead: f.tokens_cache_lectura,
      cacheWrite: f.tokens_cache_escritura,
    }) / 1_000_000
  );
}

export const TRAMOS_CONTEXTO = [
  { clave: "lt12", texto: "< 12k", desde: 0, hasta: 12_000 },
  { clave: "12_18", texto: "12–18k", desde: 12_000, hasta: 18_000 },
  { clave: "18_24", texto: "18–24k", desde: 18_000, hasta: 24_000 },
  { clave: "ge24", texto: "24k o más", desde: 24_000, hasta: Number.POSITIVE_INFINITY },
] as const;

export const esCortePorTiempo = (f: Pick<FilaRegistroChat, "error_codigo">): boolean => f.error_codigo === "tiempo";

export type TramoContexto = { clave: string; texto: string; respuestas: number; cortes: number; tasaCorte: number | null };

export function porTramoDeContexto(filas: readonly FilaRegistroChat[]): TramoContexto[] {
  return TRAMOS_CONTEXTO.map((t) => {
    const del = filas.filter((f) => {
      const c = contextoTokens(f);
      return c >= t.desde && c < t.hasta;
    });
    const cortes = del.filter(esCortePorTiempo).length;
    return { clave: t.clave, texto: t.texto, respuestas: del.length, cortes, tasaCorte: del.length ? cortes / del.length : null };
  });
}

export type DiaChat = { fecha: string; respuestas: number; cortes: number; p90Ms: number | null; contextoPromedio: number | null };

/** Un renglón por día (fecha AR), del más reciente al más viejo. */
export function porDia(filas: readonly FilaRegistroChat[]): DiaChat[] {
  const grupos = new Map<string, FilaRegistroChat[]>();
  for (const f of filas) {
    const dia = fechaISOEnAR(new Date(f.created_at));
    const lista = grupos.get(dia) ?? [];
    lista.push(f);
    grupos.set(dia, lista);
  }
  return [...grupos.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([fecha, lista]) => ({
      fecha,
      respuestas: lista.length,
      cortes: lista.filter(esCortePorTiempo).length,
      p90Ms: percentil(lista.map((f) => f.latencia_ms), 90),
      contextoPromedio: promedio(lista.map(contextoTokens)),
    }));
}

export type ConteoNombre = { nombre: string; n: number };

export function topTools(filas: readonly FilaRegistroChat[], limite = 10): ConteoNombre[] {
  const cuenta = new Map<string, number>();
  for (const f of filas) for (const t of new Set(f.tools ?? [])) cuenta.set(t, (cuenta.get(t) ?? 0) + 1);
  return [...cuenta.entries()]
    .map(([nombre, n]) => ({ nombre, n }))
    .sort((a, b) => b.n - a.n || a.nombre.localeCompare(b.nombre))
    .slice(0, limite);
}

export function desgloseErrores(filas: readonly FilaRegistroChat[]): ConteoNombre[] {
  const cuenta = new Map<string, number>();
  for (const f of filas) {
    if (!f.error_codigo) continue;
    cuenta.set(f.error_codigo, (cuenta.get(f.error_codigo) ?? 0) + 1);
  }
  return [...cuenta.entries()].map(([nombre, n]) => ({ nombre, n })).sort((a, b) => b.n - a.n || a.nombre.localeCompare(b.nombre));
}

export type ResumenChat = {
  respuestas: number;
  tasaCorte: number | null;
  latenciaP50: number | null;
  latenciaP90: number | null;
  primerTokenP50: number | null;
  primerTokenP90: number | null;
  contextoPromedio: number | null;
  ratioCache: number | null;
  costoPromedioUsd: number | null;
};

export function resumir(filas: readonly FilaRegistroChat[]): ResumenChat {
  const n = filas.length;
  const contexto = filas.reduce((a, f) => a + contextoTokens(f), 0);
  const lectura = filas.reduce((a, f) => a + f.tokens_cache_lectura, 0);
  return {
    respuestas: n,
    tasaCorte: n ? filas.filter(esCortePorTiempo).length / n : null,
    latenciaP50: percentil(filas.map((f) => f.latencia_ms), 50),
    latenciaP90: percentil(filas.map((f) => f.latencia_ms), 90),
    primerTokenP50: percentil(filas.map((f) => f.latencia_primer_token_ms), 50),
    primerTokenP90: percentil(filas.map((f) => f.latencia_primer_token_ms), 90),
    contextoPromedio: n ? contexto / n : null,
    ratioCache: contexto > 0 ? lectura / contexto : null,
    costoPromedioUsd: n ? filas.reduce((a, f) => a + costoUsdDeFila(f), 0) / n : null,
  };
}

export type VersionChat = ResumenChat & { version: string; ultimaVez: string };

/** Comparación por `version_prompt`: la versión vista más recientemente primero. */
export function porVersion(filas: readonly FilaRegistroChat[]): VersionChat[] {
  const grupos = new Map<string, FilaRegistroChat[]>();
  for (const f of filas) {
    const lista = grupos.get(f.version_prompt) ?? [];
    lista.push(f);
    grupos.set(f.version_prompt, lista);
  }
  return [...grupos.entries()]
    .map(([version, lista]) => ({
      version,
      ultimaVez: lista.reduce((a, f) => (f.created_at > a ? f.created_at : a), ""),
      ...resumir(lista),
    }))
    .sort((a, b) => (a.ultimaVez < b.ultimaVez ? 1 : -1));
}

export type ResumenValoraciones = { total: number; positivas: number; negativas: number; porcentajePositivas: number | null };

export function resumirValoraciones(filas: readonly Pick<FilaValoracion, "valor">[]): ResumenValoraciones {
  const positivas = filas.filter((f) => f.valor === 1).length;
  const negativas = filas.filter((f) => f.valor === -1).length;
  const total = positivas + negativas;
  return { total, positivas, negativas, porcentajePositivas: total ? positivas / total : null };
}

/** Prefijo corto de un id de usuario: alcanza para cruzar con /adminvita/usuarios sin exponer nombres. */
export function prefijoId(id: string): string {
  return id.slice(0, 8);
}
