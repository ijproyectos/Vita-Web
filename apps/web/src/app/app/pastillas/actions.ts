"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";
import * as inventarioNucleo from "@/lib/inventario/nucleo";
import { TAMANO_MAXIMO_BYTES, contarPastillasEnFoto, type ConteoPastillas } from "@/lib/inventario/contar";
import {
  PASTILLAS_POR_TOMA_MAXIMO,
  STOCK_MAXIMO,
  claveMedicamento,
  separarDosis,
} from "@/lib/inventario/tipos";
import { perfilActivoEditable } from "@/lib/familia/perfil-activo";

export type EstadoConteo =
  | { status: "idle" }
  | { status: "contado"; conteo: ConteoPastillas }
  // La IA no pudo (o no hay foto válida): el usuario sigue con carga manual.
  | { status: "manual"; message: string };

export type EstadoGuardado =
  | { status: "idle" }
  | { status: "success" }
  // El nombre no coincide con ningún medicamento del usuario: es uno nuevo,
  // el cliente navega a `url` (form de agregar medicamento prellenado).
  | { status: "nuevo"; url: string }
  | { status: "error"; message: string };

// Analiza la foto del blister y devuelve el conteo para que el usuario lo
// revise y lo edite — NO guarda nada (el guardado es una acción aparte y
// explícita). La foto no se persiste. Nunca lanza.
export async function contarFotoAction(_prev: EstadoConteo, formData: FormData): Promise<EstadoConteo> {
  // requireUser fuera del try: su redirect("/login") lanza NEXT_REDIRECT y
  // el catch lo convertiría en un mensaje en vez de redirigir.
  const usuario = await requireUser();
  try {

    const frente = formData.get("frente");
    if (!(frente instanceof File) || frente.size === 0) {
      return { status: "manual", message: "Sacá primero la foto del frente (donde se ven las pastillas), o cargá la cantidad a mano." };
    }
    // El dorso es opcional: si no vino (o vino vacío) se cuenta solo con el frente.
    const dorsoCrudo = formData.get("dorso");
    const dorso = dorsoCrudo instanceof File && dorsoCrudo.size > 0 ? dorsoCrudo : null;

    for (const f of dorso ? [frente, dorso] : [frente]) {
      if (f.size > TAMANO_MAXIMO_BYTES) {
        return { status: "manual", message: "Una foto pesa demasiado (máximo 5 MB). Probá con otra o cargá la cantidad a mano." };
      }
    }

    const codificar = async (f: File) => ({
      base64: Buffer.from(await f.arrayBuffer()).toString("base64"),
      mediaType: f.type,
    });
    const resultado = await contarPastillasEnFoto(usuario.id, await codificar(frente), dorso ? await codificar(dorso) : null);

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
// núcleo. Tres caminos:
//  - hay `medicamentoId` (eligió uno existente): guarda/actualiza su stock;
//  - no hay, pero nombre+dosis coinciden con un medicamento del usuario: ídem;
//  - no coincide con nada: es un medicamento NUEVO, devuelve la URL del form de
//    agregar medicamento prellenado y con el stock contado, que se guarda recién
//    cuando el medicamento exista (así no quedan inventarios huérfanos).
export async function guardarInventarioAction(_prev: EstadoGuardado, formData: FormData): Promise<EstadoGuardado> {
  await requireUser(); // fuera del try, ver contarFotoAction
  // Familia: el stock es del perfil activo (permiso "editar").
  const destino = await perfilActivoEditable();
  if (!destino.ok) return { status: "error", message: destino.message };
  const pid = destino.perfil.id;
  try {
    const supabase = await createClient();

    let medicamentoId = String(formData.get("medicamentoId") ?? "").trim();
    const nombre = String(formData.get("nombre") ?? "").trim().slice(0, 80);
    const dosisTexto = String(formData.get("dosis") ?? "").trim().slice(0, 40);
    const stockCrudo = String(formData.get("stock") ?? "").trim();
    const porTomaCrudo = String(formData.get("pastillasPorToma") ?? "").trim();

    const stock = Number(stockCrudo);
    const porToma = Number(porTomaCrudo);

    if (stockCrudo === "" || !Number.isInteger(stock) || stock < 0 || stock > STOCK_MAXIMO) {
      return { status: "error", message: "Indicá cuántas pastillas quedan (un número entero, 0 o más)." };
    }
    if (porTomaCrudo === "" || !Number.isInteger(porToma) || porToma < 1 || porToma > PASTILLAS_POR_TOMA_MAXIMO) {
      return { status: "error", message: "Indicá cuántas pastillas tomás cada vez (entre 1 y 20)." };
    }

    const { valor: dosisValor, unidad } = separarDosis(dosisTexto);

    if (!medicamentoId) {
      if (!nombre) return { status: "error", message: "Escribí el nombre del medicamento." };

      const grupos = await inventarioNucleo.listarGrupos(supabase, pid);
      const clave = claveMedicamento(nombre, dosisValor);
      let coincidencia = grupos.find((g) => g.clave === clave);
      if (!coincidencia && !dosisValor) {
        // Sin dosis: solo se enlaza si el nombre identifica a UN medicamento.
        const mismoNombre = grupos.filter((g) => claveMedicamento(g.nombre, null).split("|")[0] === clave.split("|")[0]);
        if (mismoNombre.length === 1) coincidencia = mismoNombre[0];
      }

      if (!coincidencia) {
        const params = new URLSearchParams({
          nombre,
          stock: String(stock),
          porToma: String(porToma),
        });
        if (dosisValor) params.set("dosis", dosisValor);
        if (unidad) params.set("unidad", unidad);
        return { status: "nuevo", url: `/app/agregar-medicamento?${params.toString()}` };
      }
      medicamentoId = coincidencia.representanteId;
    }

    await inventarioNucleo.guardar(supabase, pid, { medicamentoId, stock, pastillasPorToma: porToma });
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "No se pudo guardar el stock." };
  }

  revalidatePath("/app");
  revalidatePath("/app/rutina");
  revalidatePath("/app/pastillas");
  revalidatePath("/app/mi-salud");
  return { status: "success" };
}
