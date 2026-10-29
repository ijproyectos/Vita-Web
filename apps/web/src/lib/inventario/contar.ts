import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { registrarUsoIA, verificarLimiteDiario } from "@/lib/uso-ia/nucleo";
import { STOCK_MAXIMO, acotarEntero } from "./tipos";
import { MODELO_IA } from "@/lib/ai/modelo";

// Único punto de contacto con Anthropic para contar pastillas — mismo setup
// que lib/estudios/extraer.ts (server-only, salida estructurada por zod,
// nunca lanza, cuenta tokens contra el límite diario).
const MODEL = MODELO_IA;

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
  nombre_detectado: z
    .string()
    .nullable()
    .describe(
      "Nombre del medicamento (marca o droga) tal como está IMPRESO en el blister, ej. 'Metformina'. SOLO si se lee con claridad en alguna de las fotos. null si no se ve texto legible: nunca lo adivines por la forma o el color de las pastillas."
    ),
  dosis_detectada: z
    .string()
    .nullable()
    .describe(
      "Dosis impresa por pastilla con su unidad, ej. '500 mg'. SOLO si se lee con claridad. null si no se ve."
    ),
});

export type ConteoPastillas = {
  pastillasRestantes: number;
  alveolosTotales: number | null;
  blistersDetectados: number;
  confianza: "alta" | "media" | "baja";
  nota: string | null;
  nombreDetectado: string | null;
  dosisDetectada: string | null;
};

export type ResultadoConteo = { ok: true; datos: ConteoPastillas } | { ok: false; error: string };

const TIPOS_SOPORTADOS = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;

// La API de imágenes de Anthropic rechaza archivos de más de 5 MB.
export const TAMANO_MAXIMO_BYTES = 5 * 1024 * 1024;

const PROMPT_FRENTE = `Esta es una foto de uno o más blisters (planchas) de pastillas. Contá cuántas pastillas SIGUEN en el blister: cada alvéolo que todavía tiene su pastilla y no fue abierto ni perforado. No cuentes los alvéolos vacíos o rotos. Si hay varios blisters, sumá todos. Si la foto no muestra ningún blister, devolvé blisters_detectados = 0 y pastillas_restantes = 0. Sé honesto con la confianza: si algo está tapado, borroso o cortado, bajala y explicalo en la nota.

Además, si en alguna foto se lee con claridad el nombre del medicamento y su dosis impresos en el blister (normalmente en el lado de aluminio), devolvelos en nombre_detectado y dosis_detectada. Si no hay texto legible, devolvé null en ambos: no adivines el nombre.`;

const PROMPT_FRENTE_Y_DORSO = `Te paso DOS fotos del mismo medicamento. La PRIMERA es el frente del blister (el lado donde se ven las pastillas): usala para contar. La SEGUNDA es el dorso (el lado de aluminio con el nombre y la dosis impresos): usala para leer nombre_detectado y dosis_detectada. Contá cuántas pastillas SIGUEN en el blister: cada alvéolo que todavía tiene su pastilla y no fue abierto ni perforado; no cuentes los alvéolos vacíos o rotos, y sumá todos los blisters si hay varios. Si la primera foto no muestra ningún blister, devolvé blisters_detectados = 0 y pastillas_restantes = 0. Sé honesto con la confianza y explicá en la nota lo que dificulte el conteo. Si el nombre o la dosis no se leen con claridad en ninguna de las dos fotos, devolvé null: no los adivines.`;

function limpiarTexto(valor: string | null | undefined, largoMax: number): string | null {
  const t = typeof valor === "string" ? valor.trim().replace(/\s+/g, " ") : "";
  return t ? t.slice(0, largoMax) : null;
}

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
    nombreDetectado: limpiarTexto(crudo.nombre_detectado, 80),
    dosisDetectada: limpiarTexto(crudo.dosis_detectada, 40),
  };
}

/**
 * Cuenta las pastillas que quedan en la(s) foto(s) de blister. Nunca lanza:
 * quien llama siempre puede caer a carga manual si esto falla (formato no
 * soportado, límite diario, sin ANTHROPIC_API_KEY, error de red, foto sin
 * blister). La foto NO se guarda — solo se analiza.
 */
export type ImagenBlister = { base64: string; mediaType: string };

export async function contarPastillasEnFoto(
  usuarioId: string,
  frente: ImagenBlister,
  dorso?: ImagenBlister | null
): Promise<ResultadoConteo> {
  // Mismo criterio que lib/estudios/extraer.ts: nunca asumir el mime real
  // (HEIC de iPhone, etc.) — declinar explícito en vez de mandarlo mal
  // etiquetado.
  for (const img of dorso ? [frente, dorso] : [frente]) {
    if (!(TIPOS_SOPORTADOS as readonly string[]).includes(img.mediaType)) {
      return {
        ok: false,
        error: `No puedo leer fotos en formato ${img.mediaType || "desconocido"}. Probá con una JPG o PNG, o cargá la cantidad a mano.`,
      };
    }
  }

  const limite = await verificarLimiteDiario(usuarioId);
  if (!limite.ok) {
    return { ok: false, error: limite.mensaje };
  }

  try {
    const bloque = (img: ImagenBlister) =>
      ({
        type: "image",
        source: { type: "base64", media_type: img.mediaType as (typeof TIPOS_SOPORTADOS)[number], data: img.base64 },
      }) as const;

    const mensaje = await anthropic.messages.parse({
      model: MODEL,
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: [
            bloque(frente),
            ...(dorso ? [bloque(dorso)] : []),
            { type: "text", text: dorso ? PROMPT_FRENTE_Y_DORSO : PROMPT_FRENTE },
          ],
        },
      ],
      output_config: { format: zodOutputFormat(ConteoSchema) },
    });

    await registrarUsoIA(usuarioId, {
      modelo: MODEL,
      inputTokens: mensaje.usage.input_tokens,
      outputTokens: mensaje.usage.output_tokens,
      cacheReadTokens: mensaje.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: mensaje.usage.cache_creation_input_tokens ?? 0,
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
