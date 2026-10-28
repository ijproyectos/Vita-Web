import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { TIPO_PDF, type DatosExtraidos } from "./tipos";
import { registrarUsoIA, verificarLimiteDiario } from "@/lib/uso-ia/nucleo";
import { MODELO_IA } from "@/lib/ai/modelo";

// Único punto de contacto con Anthropic para esto — mismo criterio que
// generar-plan.ts de NutrIA (server-only, un archivo, salida estructurada
// vía zod en vez de texto libre sin validar).
const MODEL = MODELO_IA;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const EstudioExtraidoSchema = z.object({
  tipo: z
    .string()
    .nullable()
    .describe("Tipo de estudio médico, ej. 'Análisis de sangre completo', 'Radiografía de tórax'. null si no se puede determinar."),
  fecha: z
    .string()
    .nullable()
    .describe("Fecha del estudio en formato YYYY-MM-DD, SOLO si está visible en la imagen. null si no se ve ninguna fecha."),
  resumen: z.string().describe("Resumen breve (1-2 oraciones) del contenido o hallazgos del estudio, en español."),
  valores: z
    .array(
      z.object({
        nombre: z.string().describe("Nombre del parámetro, ej. 'Hemoglobina'."),
        valor: z.string().describe("Solo el resultado, sin la unidad, ej. '14,2'. Respetá el formato impreso."),
        unidad: z.string().nullable().describe("Unidad impresa junto al resultado, ej. 'g/dL'. null si no figura."),
        rango_min: z
          .number()
          .nullable()
          .describe("Límite inferior del rango de referencia IMPRESO en el documento. null si no está impreso o no tiene límite inferior."),
        rango_max: z
          .number()
          .nullable()
          .describe("Límite superior del rango de referencia IMPRESO en el documento. null si no está impreso o no tiene límite superior."),
        rango_texto: z
          .string()
          .nullable()
          .describe("Rango de referencia tal como está impreso cuando no es un simple mínimo–máximo (ej. 'Negativo', 'Menor a 200'). null si no aplica."),
        estado: z
          .enum(["normal", "alto", "bajo"])
          .nullable()
          .describe("'alto'/'bajo' solo si el documento lo marca (H/L, asterisco, negrita) o el resultado cae claramente fuera del rango impreso; 'normal' si está dentro. null si no hay rango impreso."),
      })
    )
    .describe("Valores/mediciones relevantes visibles. Array vacío si no aplica. NUNCA inventes rangos: solo los impresos en el documento."),
});

export type ExtraccionResultado =
  | { ok: true; datos: DatosExtraidos }
  | { ok: false; error: string };

const TIPOS_IMAGEN = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
export const TIPOS_SOPORTADOS: readonly string[] = [...TIPOS_IMAGEN, TIPO_PDF];

/**
 * Analiza la foto o el PDF de un estudio médico y extrae
 * tipo/fecha/resumen/valores. Nunca lanza — quien llama siempre puede
 * guardar el estudio igual (solo con el archivo) si esto falla, sea porque
 * no es legible, porque no hay ANTHROPIC_API_KEY configurada, o cualquier
 * otro error de red.
 */
export async function extraerDatosEstudio(
  usuarioId: string,
  imagenBase64: string,
  mediaType: string
): Promise<ExtraccionResultado> {
  // Antes esto caía a "image/jpeg" para cualquier tipo no soportado (ej.
  // HEIC, común en fotos de iPhone tomadas desde la galería) y mandaba los
  // bytes reales igual, etiquetados mal — la API podía "leer" una imagen
  // rota sin avisar. Mejor declinar de entrada, explícito, que mandar un
  // tipo falso.
  if (!TIPOS_SOPORTADOS.includes(mediaType)) {
    return {
      ok: false,
      error: `Formato no compatible para análisis automático (${mediaType || "desconocido"}). El archivo se guarda igual.`,
    };
  }

  // Límite diario por usuario (lib/uso-ia/nucleo.ts) — chequeado ANTES de
  // gastar nada: si ya lo superó, el estudio se guarda igual (mismo
  // camino que cualquier otra falla de extracción), solo que sin
  // consumir crédito de Anthropic para intentarlo.
  const limite = await verificarLimiteDiario(usuarioId);
  if (!limite.ok) {
    return { ok: false, error: limite.mensaje };
  }

  try {
    // PDF va como bloque `document`; las fotos como `image`. El tipo ya se
    // validó arriba contra la lista de soportados.
    const esPdf = mediaType === TIPO_PDF;
    const bloqueArchivo = esPdf
      ? ({
          type: "document",
          source: { type: "base64", media_type: TIPO_PDF, data: imagenBase64 },
        } as const)
      : ({
          type: "image",
          source: { type: "base64", media_type: mediaType as (typeof TIPOS_IMAGEN)[number], data: imagenBase64 },
        } as const);

    const mensaje = await anthropic.messages.parse({
      model: MODEL,
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: [
            bloqueArchivo,
            {
              type: "text",
              text: esPdf
                ? "Este es un PDF de un estudio médico (análisis de laboratorio, informe, etc.). Extraé la información visible. Para cada valor, separá resultado y unidad, y copiá el rango de referencia solo si está impreso en el documento (nunca lo completes de memoria)."
                : "Esta es una foto de un estudio médico (análisis de laboratorio, radiografía, informe, etc.). Extraé la información visible. Para cada valor, separá resultado y unidad, y copiá el rango de referencia solo si está impreso en el documento (nunca lo completes de memoria).",
            },
          ],
        },
      ],
      output_config: { format: zodOutputFormat(EstudioExtraidoSchema) },
    });

    await registrarUsoIA(usuarioId, {
      inputTokens: mensaje.usage.input_tokens,
      outputTokens: mensaje.usage.output_tokens,
    });

    if (!mensaje.parsed_output) {
      return { ok: false, error: "No se pudo interpretar la respuesta del modelo." };
    }

    return { ok: true, datos: mensaje.parsed_output };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error desconocido." };
  }
}
