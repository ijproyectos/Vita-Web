import { createHash } from "node:crypto";

// Lógica pura del registro por respuesta del chat (tabla registros_chat, migración 034):
// sin I/O ni `server-only`, para poder testearla (registros-logica.test.ts).

export type ResultadoRegistro = "ok" | "error" | "limite" | "confirmacion" | "cancelacion" | "replay";

export type FilaRegistroChat = {
  usuario_id: string;
  pedido_id: string | null;
  sesion_id: string | null;
  version_prompt: string;
  modelo: string;
  latencia_ms: number;
  latencia_primer_token_ms: number | null;
  vueltas_modelo: number;
  tools: string[];
  escrituras: number;
  tokens_entrada: number;
  tokens_salida: number;
  tokens_cache_lectura: number;
  tokens_cache_escritura: number;
  resultado: ResultadoRegistro;
  error_codigo: string | null;
};

/**
 * Hash corto y estable (12 hex de sha256) de lo que define el comportamiento del modelo: la plantilla
 * ESTÁTICA del system prompt + las definiciones de tools + el id del modelo. El contexto dinámico
 * (fecha, familia, "Hoy") NO entra: se arma por request y cambiaría el hash a cada mensaje.
 */
export function calcularVersionPrompt(plantillaSystem: string, tools: unknown, modelo: string): string {
  return createHash("sha256")
    .update(JSON.stringify({ plantillaSystem, tools, modelo }))
    .digest("hex")
    .slice(0, 12);
}

/** Cuántas de las tools llamadas son de escritura. */
export function contarEscrituras(nombres: string[], toolsDeEscritura: ReadonlySet<string>): number {
  return nombres.filter((n) => toolsDeEscritura.has(n)).length;
}

/**
 * Código corto para el error de un turno: nunca el mensaje (puede traer datos del usuario).
 * Acepta unknown a propósito; reconoce los errores del SDK de Anthropic por `name`/`status`.
 */
export function clasificarError(e: unknown): string {
  if (typeof e !== "object" || e === null) return "interno";
  const err = e as { name?: unknown; status?: unknown; code?: unknown; details?: unknown };
  if (err.name === "APIConnectionTimeoutError") return "timeout";
  if (err.name === "APIUserAbortError") return "stream_abort";
  if (typeof err.status === "number") return `anthropic_${err.status}`;
  if (err.name === "APIConnectionError") return "anthropic_conexion";
  // Forma de un PostgrestError de Supabase ({code, details, hint, message}).
  if (typeof err.code === "string" && "details" in err) return "db";
  if (err.name === "TypeError" && /controller|stream|closed/i.test(String((e as Error).message))) return "stream_abort";
  return "interno";
}

/** Estado mutable que la ruta va llenando durante la respuesta. */
export type MedicionChat = {
  resultado: ResultadoRegistro;
  errorCodigo: string | null;
  sesionId: string | null;
  vueltas: number;
  tools: string[];
  primerTokenMs: number | null;
  tokensEntrada: number;
  tokensSalida: number;
  tokensCacheLectura: number;
  tokensCacheEscritura: number;
};

export function medicionInicial(): MedicionChat {
  return {
    resultado: "ok",
    errorCodigo: null,
    sesionId: null,
    vueltas: 0,
    tools: [],
    primerTokenMs: null,
    tokensEntrada: 0,
    tokensSalida: 0,
    tokensCacheLectura: 0,
    tokensCacheEscritura: 0,
  };
}

export function construirFilaRegistro(args: {
  usuarioId: string;
  pedidoId: string | null;
  versionPrompt: string;
  modelo: string;
  inicioMs: number;
  finMs: number;
  medicion: MedicionChat;
  toolsDeEscritura: ReadonlySet<string>;
}): FilaRegistroChat {
  const m = args.medicion;
  return {
    usuario_id: args.usuarioId,
    pedido_id: args.pedidoId,
    sesion_id: m.sesionId,
    version_prompt: args.versionPrompt,
    modelo: args.modelo,
    latencia_ms: Math.max(0, Math.round(args.finMs - args.inicioMs)),
    latencia_primer_token_ms: m.primerTokenMs === null ? null : Math.max(0, Math.round(m.primerTokenMs)),
    vueltas_modelo: m.vueltas,
    tools: m.tools,
    escrituras: contarEscrituras(m.tools, args.toolsDeEscritura),
    tokens_entrada: m.tokensEntrada,
    tokens_salida: m.tokensSalida,
    tokens_cache_lectura: m.tokensCacheLectura,
    tokens_cache_escritura: m.tokensCacheEscritura,
    resultado: m.resultado,
    error_codigo: m.errorCodigo,
  };
}
