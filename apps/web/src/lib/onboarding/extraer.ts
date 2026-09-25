import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

// Único punto de contacto con Anthropic para el onboarding conversacional
// nuevo — mismo criterio que lib/estudios/extraer.ts: server-only, un
// archivo, salida estructurada vía zod (nunca texto libre sin validar),
// nunca lanza (quien llama siempre puede degradar a un form manual si esto
// falla, sea por falta de ANTHROPIC_API_KEY, red, o una respuesta
// inutilizable del modelo).
const MODEL = "claude-sonnet-5";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MOMENTOS = ["mañana", "mediodia", "tarde", "noche"] as const;

const EDAD_MIN = 0;
const EDAD_MAX = 130;

// --- Nombre + edad ----------------------------------------------------

const NombreEdadSchema = z.object({
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
});

export type NombreEdadExtraido = z.infer<typeof NombreEdadSchema>;
export type ResultadoExtraccionNombreEdad = { ok: true; datos: NombreEdadExtraido } | { ok: false; error: string };

/**
 * Extrae nombre + edad de una descripción en texto libre (ya sea tipeada o
 * transcripta de audio río arriba — este módulo solo recibe texto, nunca
 * audio). `relacion` (ej. "Mamá") da contexto para desambiguar pronombres,
 * no se valida contra un catálogo cerrado. Nunca lanza.
 */
export async function extraerNombreEdad(texto: string, relacion: string): Promise<ResultadoExtraccionNombreEdad> {
  const textoLimpio = texto.trim();
  if (!textoLimpio) {
    return { ok: false, error: "No se recibió ningún texto para interpretar." };
  }

  try {
    const mensaje = await anthropic.messages.parse({
      model: MODEL,
      max_tokens: 256,
      messages: [
        {
          role: "user",
          content: `Un cuidador está describiendo, durante el onboarding de una app de salud, a la persona que cuida (relación: "${relacion || "familiar"}"). Extraé el nombre de pila y la edad (si la menciona) de este texto: "${textoLimpio}"`,
        },
      ],
      output_config: { format: zodOutputFormat(NombreEdadSchema) },
    });

    if (!mensaje.parsed_output) {
      return { ok: false, error: "No se pudo interpretar la respuesta del modelo." };
    }

    const datos = mensaje.parsed_output;
    // Defensa extra sobre lo que ya valida zod (tipo/entero): una edad
    // fuera de un rango humano razonable es casi seguro un error de
    // interpretación del modelo, no un dato real — se descarta en vez de
    // dejar pasar un valor absurdo a una columna `int`.
    const edad = datos.edad !== null && datos.edad >= EDAD_MIN && datos.edad <= EDAD_MAX ? datos.edad : null;

    return { ok: true, datos: { nombre: datos.nombre.trim(), edad } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error desconocido." };
  }
}

// --- Medicamentos -------------------------------------------------------

const MedicamentoExtraidoSchema = z.object({
  nombre: z.string().describe("Nombre del medicamento tal como lo dijo el usuario (ej. 'Losartán'), con la primera letra en mayúscula."),
  dosis: z.string().nullable().describe("Cantidad/dosis como texto libre, ej. '50' o '1 comprimido'. null si no se menciona."),
  unidad: z.string().describe("Unidad de la dosis, ej. 'mg', 'ml', 'gotas', 'comp.'. Usar 'mg' si no se especifica ninguna."),
  momentos: z
    .array(z.enum(MOMENTOS))
    .describe(
      "Uno o más momentos del día en que se toma, derivados de frases como 'a la mañana y a la noche' (un mismo medicamento puede tener varios horarios). Si no se menciona ningún momento, devolver ['mañana'] como mejor estimación."
    ),
  frecuencia: z.string().nullable().describe("Frecuencia descriptiva tal como la dijo el usuario, ej. 'todos los días', 'cada 8 horas'. null si no se menciona."),
});

const MedicamentosExtraidosSchema = z.object({
  medicamentos: z
    .array(MedicamentoExtraidoSchema)
    .describe("Todos los medicamentos mencionados en el texto (puede ser uno o varios). Array vacío si no se reconoce ningún medicamento."),
});

export type MedicamentoExtraido = z.infer<typeof MedicamentoExtraidoSchema>;
export type ResultadoExtraccionMedicamentos = { ok: true; datos: MedicamentoExtraido[] } | { ok: false; error: string };

/**
 * Extrae una lista estructurada de medicamentos (nombre/dosis/unidad,
 * uno o más momentos del día, frecuencia) de una descripción en texto
 * libre. Nunca lanza — degrada a `{ok:false}` para que la UI caiga a
 * carga manual en vez de perder lo que la persona dijo.
 */
export async function extraerMedicamentos(texto: string): Promise<ResultadoExtraccionMedicamentos> {
  const textoLimpio = texto.trim();
  if (!textoLimpio) {
    return { ok: false, error: "No se recibió ningún texto para interpretar." };
  }

  try {
    const mensaje = await anthropic.messages.parse({
      model: MODEL,
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Una persona está describiendo, en lenguaje libre, qué medicamentos toma (puede mencionar uno o varios, cada uno con uno o más horarios). Extraé la lista estructurada de este texto: "${textoLimpio}"`,
        },
      ],
      output_config: { format: zodOutputFormat(MedicamentosExtraidosSchema) },
    });

    if (!mensaje.parsed_output) {
      return { ok: false, error: "No se pudo interpretar la respuesta del modelo." };
    }

    if (mensaje.parsed_output.medicamentos.length === 0) {
      return { ok: false, error: "No pudimos reconocer ningún medicamento en lo que describiste." };
    }

    return { ok: true, datos: mensaje.parsed_output.medicamentos };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error desconocido." };
  }
}
