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
export async function extraerNombreEdad(
  usuarioId: string,
  texto: string,
  relacion: string
): Promise<ResultadoExtraccionNombreEdad> {
  const textoLimpio = texto.trim();
  if (!textoLimpio) {
    return { ok: false, error: "No se recibió ningún texto para interpretar." };
  }

  const limite = await verificarLimiteDiario(usuarioId);
  if (!limite.ok) {
    return { ok: false, error: limite.mensaje };
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

    await registrarUsoIA(usuarioId, {
      inputTokens: mensaje.usage.input_tokens,
      outputTokens: mensaje.usage.output_tokens,
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
