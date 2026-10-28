import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import * as medicamentos from "@/lib/medicamentos/nucleo";
import * as inventarioNucleo from "@/lib/inventario/nucleo";
import { inicioCalendario } from "@/lib/rutina/historial";
import type { Medicamento, TomaRegistrada } from "@/lib/medicamentos/tipos";

// Lo que la hoja "Detalle medicamento" necesita para abrirse desde cualquier
// lista (Mis medicamentos, Home…), no solo desde la Rutina.

export type DatosDetalleMedicamento = {
  todosLosMeds: Medicamento[];
  tomas: TomaRegistrada[];
  hoy: string;
  stockPorMedicamento: Record<string, { stock: number; umbral: number; dias: number | null }>;
  /** id -> tomado, solo de los medicamentos que tocan hoy. */
  tomadoHoy: Record<string, boolean>;
};

export async function cargarDatosDetalleMedicamento(
  supabase: SupabaseClient,
  perfilId: string,
  todosLosMeds: Medicamento[]
): Promise<DatosDetalleMedicamento> {
  const hoy = medicamentos.fechaEnAR();
  const [medsHoy, tomas, grupos] = await Promise.all([
    medicamentos.listarHoy(supabase, perfilId),
    medicamentos.listarTomasDesde(supabase, perfilId, inicioCalendario(hoy)),
    inventarioNucleo.listarGruposSeguro(supabase, perfilId),
  ]);
  const stockPorMedicamento: DatosDetalleMedicamento["stockPorMedicamento"] = {};
  for (const g of grupos) {
    if (!g.inventario) continue;
    const dias = inventarioNucleo.diasQueAlcanza(g);
    for (const id of g.medicamentoIds) {
      stockPorMedicamento[id] = { stock: g.inventario.stock, umbral: g.inventario.umbral_alerta, dias };
    }
  }
  return {
    todosLosMeds,
    tomas,
    hoy,
    stockPorMedicamento,
    tomadoHoy: Object.fromEntries(medsHoy.map((m) => [m.id, m.tomado])),
  };
}
