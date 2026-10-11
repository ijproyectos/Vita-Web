"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";
import * as inventarioNucleo from "@/lib/inventario/nucleo";
import { TAMANO_MAXIMO_BYTES, contarPastillasEnFoto, type ConteoPastillas } from "@/lib/inventario/contar";
import { PASTILLAS_POR_TOMA_MAXIMO, STOCK_MAXIMO } from "@/lib/inventario/tipos";

export type EstadoConteo =
  | { status: "idle" }
  | { status: "contado"; conteo: ConteoPastillas }
  // La IA no pudo (o no hay foto válida): el usuario sigue con carga manual.
  | { status: "manual"; message: string };

export type EstadoGuardado = { status: "idle" } | { status: "success" } | { status: "error"; message: string };

// Analiza la foto del blister y devuelve el conteo para que el usuario lo
// revise y lo edite — NO guarda nada (el guardado es una acción aparte y
// explícita). La foto no se persiste. Nunca lanza.
export async function contarFotoAction(_prev: EstadoConteo, formData: FormData): Promise<EstadoConteo> {
  try {
    const usuario = await requireUser();

    const archivo = formData.get("archivo");
    if (!(archivo instanceof File) || archivo.size === 0) {
      return { status: "manual", message: "Elegí o sacá una foto primero, o cargá la cantidad a mano." };
    }
    if (archivo.size > TAMANO_MAXIMO_BYTES) {
      return { status: "manual", message: "La foto pesa demasiado (máximo 5 MB). Probá con otra o cargá la cantidad a mano." };
    }

    const base64 = Buffer.from(await archivo.arrayBuffer()).toString("base64");
    const resultado = await contarPastillasEnFoto(usuario.id, base64, archivo.type);

    if (!resultado.ok) return { status: "manual", message: resultado.error };
    return { status: "contado", conteo: resultado.datos };
  } catch (e) {
    return {
      status: "manual",
      message: e instanceof Error ? `No pude contar la foto (${e.message}). Cargá la cantidad a mano.` : "No pude contar la foto. Cargá la cantidad a mano.",
    };
  }
}

// Valida en el borde (un FormData siempre es texto libre) antes de tocar el
// núcleo. Guarda/actualiza el inventario y engancha todas las filas del
// medicamento a ese único stock.
export async function guardarInventarioAction(_prev: EstadoGuardado, formData: FormData): Promise<EstadoGuardado> {
  try {
    const usuario = await requireUser();
    const supabase = await createClient();

    const medicamentoId = String(formData.get("medicamentoId") ?? "").trim();
    const stockCrudo = String(formData.get("stock") ?? "").trim();
    const porTomaCrudo = String(formData.get("pastillasPorToma") ?? "").trim();

    const stock = Number(stockCrudo);
    const porToma = Number(porTomaCrudo);

    if (!medicamentoId) return { status: "error", message: "Elegí qué medicamento es." };
    if (stockCrudo === "" || !Number.isInteger(stock) || stock < 0 || stock > STOCK_MAXIMO) {
      return { status: "error", message: "Indicá cuántas pastillas quedan (un número entero, 0 o más)." };
    }
    if (porTomaCrudo === "" || !Number.isInteger(porToma) || porToma < 1 || porToma > PASTILLAS_POR_TOMA_MAXIMO) {
      return { status: "error", message: "Indicá cuántas pastillas tomás cada vez (entre 1 y 20)." };
    }

    await inventarioNucleo.guardar(supabase, usuario.id, { medicamentoId, stock, pastillasPorToma: porToma });
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "No se pudo guardar el stock." };
  }

  revalidatePath("/app");
  revalidatePath("/app/rutina");
  revalidatePath("/app/pastillas");
  revalidatePath("/app/mi-salud");
  return { status: "success" };
}
