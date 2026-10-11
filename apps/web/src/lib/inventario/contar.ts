import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { registrarUsoIA, verificarLimiteDiario } from "@/lib/uso-ia/nucleo";
import { STOCK_MAXIMO, acotarEntero } from "./tipos";

// Único punto de contacto con Anthropic para contar pastillas — mismo setup
// que lib/estudios/extraer.ts (server-only, salida estructurada por zod,
// nunca lanza, cuenta tokens contra el límite diario).
const MODEL = "claude-sonnet-5";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Sin .min()/.max(): el JSON schema de structured output no los garantiza,
// el rango se fuerza abajo en `normalizar`.
const ConteoSchema = z.object({
  pastillas_restantes: z
    .number()
    .int()
    .describe(
      "Cantidad de pastillas que TODAVÍA están en el blister (alvéolos con pastilla, sin abrir/romper). Si hay varios blisters, la suma de todos. 0 si están todos vacíos."
    ),
  alveolos_totales: z
    .number()
    .int()
    .nullable()
    .describe("Total de alvéolos (llenos + vacíos) sumando todos los blisters visibles. null si no se puede determinar."),
  blisters_detectados: z.number().int().describe("Cantidad de blisters distintos visibles en la foto. 0 si no hay ninguno."),
  confianza: z
    .enum(["alta", "media", "baja"])
    .describe("Qué tan seguro estás del conteo: 'baja' si hay reflejos, borroso, tapados o cortados."),
  nota: z
    .string()
    .nullable()
    .describe("Aclaración breve en español sobre lo que dificulta el conteo, si aplica. null si no hay nada que aclarar."),
});

export type ConteoPastillas = {
  pastillasRestantes: number;
  alveolosTotales: number | null;
  blistersDetectados: number;
  confianza: "alta" | "media" | "baja";
  nota: string | null;
};

export type ResultadoConteo = { ok: true; datos: ConteoPastillas } | { ok: false; error: string };

const TIPOS_SOPORTADOS = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;

// La API de imágenes de Anthropic rechaza archivos de más de 5 MB.
export const TAMANO_MAXIMO_BYTES = 5 * 1024 * 1024;

const PROMPT = `Esta es una foto de uno o más blisters (planchas) de pastillas. Contá cuántas pastillas SIGUEN en el blister: cada alvéolo que todavía tiene su pastilla y no fue abierto ni perforado. No cuentes los alvéolos vacíos o rotos. Si hay varios blisters, sumá todos. Si la foto no muestra ningún blister, devolvé blisters_detectados = 0 y pastillas_restantes = 0. Sé honesto con la confianza: si algo está tapado, borroso o cortado, bajala y explicalo en la nota.`;

function normalizar(crudo: z.infer<typeof ConteoSchema>): ConteoPastillas {
  const restantes = acotarEntero(crudo.pastillas_restantes, 0, STOCK_MAXIMO);
  const blisters = acotarEntero(crudo.blisters_detectados, 0, 50);

  let alveolos: number | null =
    crudo.alveolos_totales == null ? null : acotarEntero(crudo.alveolos_totales, 0, STOCK_MAXIMO);
  // Coherencia: no puede haber más pastillas que alvéolos totales.
  if (alveolos !== null && alveolos < restantes) alveolos = null;

  const nota = crudo.nota?.trim() ? crudo.nota.trim().slice(0, 300) : null;

  return {
    pastillasRestantes: restantes,
    alveolosTotales: alveolos,
    blistersDetectados: blisters,
    confianza: crudo.confianza,
    nota,
  };
}

/**
 * Cuenta las pastillas que quedan en la(s) foto(s) de blister. Nunca lanza:
 * quien llama siempre puede caer a carga manual si esto falla (formato no
 * soportado, límite diario, sin ANTHROPIC_API_KEY, error de red, foto sin
 * blister). La foto NO se guarda — solo se analiza.
 */
export async function contarPastillasEnFoto(
  usuarioId: string,
  imagenBase64: string,
  mediaType: string
): Promise<ResultadoConteo> {
  // Mismo criterio que lib/estudios/extraer.ts: nunca asumir el mime real
  // (HEIC de iPhone, etc.) — declinar explícito en vez de mandarlo mal
  // etiquetado.
  if (!(TIPOS_SOPORTADOS as readonly string[]).includes(mediaType)) {
    return {
      ok: false,
      error: `No puedo leer fotos en formato ${mediaType || "desconocido"}. Probá con una JPG o PNG, o cargá la cantidad a mano.`,
    };
  }

  const limite = await verificarLimiteDiario(usuarioId);
  if (!limite.ok) {
    return { ok: false, error: limite.mensaje };
  }

  try {
    const tipoValido = mediaType as (typeof TIPOS_SOPORTADOS)[number];

    const mensaje = await anthropic.messages.parse({
      model: MODEL,
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: tipoValido, data: imagenBase64 } },
            { type: "text", text: PROMPT },
          ],
        },
      ],
      output_config: { format: zodOutputFormat(ConteoSchema) },
    });

    await registrarUsoIA(usuarioId, {
      inputTokens: mensaje.usage.input_tokens,
      outputTokens: mensaje.usage.output_tokens,
    });

    if (!mensaje.parsed_output) {
      return { ok: false, error: "No pude interpretar la foto. Cargá la cantidad a mano." };
    }

    const datos = normalizar(mensaje.parsed_output);
    if (datos.blistersDetectados === 0) {
      return { ok: false, error: "No vi ningún blister en la foto. Probá de nuevo con buena luz o cargá la cantidad a mano." };
    }

    return { ok: true, datos };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? `No pude contar la foto (${e.message}). Cargá la cantidad a mano.` : "No pude contar la foto. Cargá la cantidad a mano." };
  }
}
