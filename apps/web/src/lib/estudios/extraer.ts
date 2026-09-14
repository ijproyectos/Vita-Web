import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { DatosExtraidos } from "./tipos";

// Único punto de contacto con Anthropic para esto — mismo criterio que
// generar-plan.ts de NutrIA (server-only, un archivo, salida estructurada
// vía zod en vez de texto libre sin validar).
const MODEL = "claude-sonnet-5";

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
    .array(z.object({ nombre: z.string(), valor: z.string() }))
    .describe("Valores/mediciones relevantes visibles (ej. {nombre: 'Hemoglobina', valor: '14.2 g/dL'}). Array vacío si no aplica."),
});

export type ExtraccionResultado =
  | { ok: true; datos: DatosExtraidos }
  | { ok: false; error: string };

/**
 * Analiza la foto de un estudio médico y extrae tipo/fecha/resumen/valores.
 * Nunca lanza — quien llama siempre puede guardar el estudio igual (solo
 * con la foto) si esto falla, sea porque la imagen no es legible, porque
 * no hay ANTHROPIC_API_KEY configurada, o cualquier otro error de red.
 */
const TIPOS_SOPORTADOS = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;

export async function extraerDatosEstudio(imagenBase64: string, mediaType: string): Promise<ExtraccionResultado> {
  // Antes esto caía a "image/jpeg" para cualquier tipo no soportado (ej.
  // HEIC, común en fotos de iPhone tomadas desde la galería) y mandaba los
  // bytes reales igual, etiquetados mal — la API podía "leer" una imagen
  // rota sin avisar. Mejor declinar de entrada, explícito, que mandar un
  // tipo falso.
  if (!(TIPOS_SOPORTADOS as readonly string[]).includes(mediaType)) {
    return {
      ok: false,
      error: `Formato de imagen no compatible para análisis automático (${mediaType || "desconocido"}). La foto se guarda igual.`,
    };
  }

  try {
    const tipoValido = mediaType as (typeof TIPOS_SOPORTADOS)[number];

    const mensaje = await anthropic.messages.parse({
      model: MODEL,
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: tipoValido, data: imagenBase64 } },
            {
              type: "text",
              text: "Esta es una foto de un estudio médico (análisis de laboratorio, radiografía, informe, etc.). Extraé la información visible.",
            },
          ],
        },
      ],
      output_config: { format: zodOutputFormat(EstudioExtraidoSchema) },
    });

    if (!mensaje.parsed_output) {
      return { ok: false, error: "No se pudo interpretar la respuesta del modelo." };
    }

    return { ok: true, datos: mensaje.parsed_output };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error desconocido." };
  }
}
