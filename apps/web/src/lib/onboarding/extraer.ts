import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { registrarUsoIA, verificarLimiteDiario } from "@/lib/uso-ia/nucleo";
import { MODELO_IA } from "@/lib/ai/modelo";

// Único punto de contacto con Anthropic para el onboarding conversacional
// nuevo — mismo criterio que lib/estudios/extraer.ts: server-only, un
// archivo, salida estructurada vía zod (nunca texto libre sin validar),
// nunca lanza (quien llama siempre puede degradar a un form manual si esto
// falla, sea por falta de ANTHROPIC_API_KEY, red, o una respuesta
// inutilizable del modelo).
const MODEL = MODELO_IA;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const EDAD_MIN = 0;
const EDAD_MAX = 130;

// --- Nombre + nacimiento ------------------------------------------------

const ParteNumero = z.number().int().nullable();

const NombreNacimientoSchema = z.object({
  nombre: z
    .string()
    .describe(
      "Nombre de pila de la persona mencionada, tal como lo dijo el usuario (respetando mayúsculas). Cadena vacía si no se menciona ningún nombre reconocible."
    ),
  edad: z
    .number()
    .int()
    .nullable()
    .describe("Edad en años, como número entero, SOLO si el usuario la mencionó explícitamente. null si no se menciona o es ambigua."),
  dia: ParteNumero.describe("Día del mes (1-31) de la fecha de nacimiento, SOLO si se dijo. null si no."),
  mes: ParteNumero.describe("Mes (1-12) de la fecha de nacimiento, SOLO si se dijo. null si no."),
  anio: ParteNumero.describe(
    "Año de nacimiento con 4 dígitos (si dijo 'del 50' interpretalo como 1950), SOLO si se dijo. null si no. Nunca lo calcules a partir de la edad."
  ),
});

const NacimientoSchema = NombreNacimientoSchema.omit({ nombre: true });

export type NombreNacimientoExtraido = { nombre: string; edad: number | null; dia: number | null; mes: number | null; anio: number | null };
export type NacimientoExtraido = Omit<NombreNacimientoExtraido, "nombre">;
export type ResultadoExtraccionNombreNacimiento = { ok: true; datos: NombreNacimientoExtraido } | { ok: false; error: string };
export type ResultadoExtraccionNacimiento = { ok: true; datos: NacimientoExtraido } | { ok: false; error: string };

/** Una parte fuera de rango humano es casi seguro un error del modelo: se descarta en vez de pasar a una columna tipada. */
function parteValida(valor: number | null, min: number, max: number): number | null {
  return valor !== null && Number.isInteger(valor) && valor >= min && valor <= max ? valor : null;
}

function limpiarNacimiento(d: NacimientoExtraido): NacimientoExtraido {
  return {
    edad: parteValida(d.edad, EDAD_MIN, EDAD_MAX),
    dia: parteValida(d.dia, 1, 31),
    mes: parteValida(d.mes, 1, 12),
    anio: parteValida(d.anio, 1850, 2100),
  };
}

async function registrar(usuarioId: string, uso: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }) {
  await registrarUsoIA(usuarioId, {
    modelo: MODEL,
    inputTokens: uso.input_tokens,
    outputTokens: uso.output_tokens,
    cacheReadTokens: uso.cache_read_input_tokens ?? 0,
    cacheWriteTokens: uso.cache_creation_input_tokens ?? 0,
  });
}

/**
 * Extrae nombre + nacimiento (fecha, año o edad) de una descripción en texto
 * libre (tipeada o transcripta río arriba: este módulo solo recibe texto).
 * `relacion` (ej. "Mamá") da contexto, no se valida contra un catálogo.
 * Nunca lanza.
 */
export async function extraerNombreNacimiento(usuarioId: string, texto: string, relacion: string): Promise<ResultadoExtraccionNombreNacimiento> {
  const textoLimpio = texto.trim();
  if (!textoLimpio) return { ok: false, error: "No se recibió ningún texto para interpretar." };

  const limite = await verificarLimiteDiario(usuarioId);
  if (!limite.ok) return { ok: false, error: limite.mensaje };

  try {
    const mensaje = await anthropic.messages.parse({
      model: MODEL,
      max_tokens: 256,
      messages: [
        {
          role: "user",
          content: `Un cuidador está describiendo, durante el onboarding de una app de salud, a la persona que cuida (relación: "${relacion || "familiar"}"). Extraé el nombre de pila y, si los dijo, la fecha de nacimiento (día, mes, año) y la edad de este texto. Fechas en formato argentino (día/mes/año). No inventes ni calcules lo que no se dijo: lo que falta va en null. Texto: "${textoLimpio}"`,
        },
      ],
      output_config: { format: zodOutputFormat(NombreNacimientoSchema) },
    });
    await registrar(usuarioId, mensaje.usage);

    if (!mensaje.parsed_output) return { ok: false, error: "No se pudo interpretar la respuesta del modelo." };
    const d = mensaje.parsed_output;
    return { ok: true, datos: { nombre: d.nombre.trim(), ...limpiarNacimiento(d) } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error desconocido." };
  }
}

/**
 * Respaldo para cuando el lector determinista no entendió una fecha dicha en
 * palabras ("veintidós de marzo del cincuenta"). Nunca lanza.
 */
export async function extraerNacimiento(usuarioId: string, texto: string): Promise<ResultadoExtraccionNacimiento> {
  const textoLimpio = texto.trim();
  if (!textoLimpio) return { ok: false, error: "No se recibió ningún texto para interpretar." };

  const limite = await verificarLimiteDiario(usuarioId);
  if (!limite.ok) return { ok: false, error: limite.mensaje };

  try {
    const mensaje = await anthropic.messages.parse({
      model: MODEL,
      max_tokens: 128,
      messages: [
        {
          role: "user",
          content: `Durante el onboarding de una app de salud, alguien contestó cuándo nació o qué edad tiene. Extraé día, mes, año (4 dígitos) y edad SOLO si se dijeron; lo que falta va en null. Fechas en formato argentino (día/mes/año). Texto: "${textoLimpio}"`,
        },
      ],
      output_config: { format: zodOutputFormat(NacimientoSchema) },
    });
    await registrar(usuarioId, mensaje.usage);

    if (!mensaje.parsed_output) return { ok: false, error: "No se pudo interpretar la respuesta del modelo." };
    return { ok: true, datos: limpiarNacimiento(mensaje.parsed_output) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error desconocido." };
  }
}
