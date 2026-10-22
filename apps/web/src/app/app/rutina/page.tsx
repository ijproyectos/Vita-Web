import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import * as medicamentos from "@/lib/medicamentos/nucleo";
import * as inventarioNucleo from "@/lib/inventario/nucleo";
import * as turnosNucleo from "@/lib/turnos/nucleo";
import * as medicionesNucleo from "@/lib/mediciones/nucleo";
import * as recetasNucleo from "@/lib/recetas/nucleo";
import { obtenerOpcionesPerfil, obtenerPerfilActivo } from "@/lib/familia/perfil-activo";
import { fechaISOEnAR } from "@/lib/rutina/formato";
import { inicioCalendario } from "@/lib/rutina/historial";
import { horaAR } from "@/lib/mediciones/resumen";
import { formatearValor, META_MEDICION } from "@/lib/mediciones/tipos";
import { RutinaView } from "./rutina-view";
import type { StockDetalle } from "./detalle-medicamento";
import type { MedicionDia } from "./historial-view";

export default async function RutinaPage() {
  await requireUser();
  const supabase = await createClient();
  const [activo, opciones] = await Promise.all([obtenerPerfilActivo(), obtenerOpcionesPerfil()]);
  const pid = activo.id;

  // Las tomas se indexan por fecha UTC (ver lib/rutina/historial.ts): "hoy"
  // del calendario es el mismo día que usa `listarHoy`.
  const hoy = medicamentos.fechaEnUTC();
  const desde = inicioCalendario(hoy);

  const [medsHoy, todosLosMeds, turnosHoy, turnosProximos, adherencia, grupos, tomas, mediciones, recetas] = await Promise.all([
    medicamentos.listarHoy(supabase, pid),
    medicamentos.listarTodos(supabase, pid),
    turnosNucleo.listarDeHoy(supabase, pid),
    turnosNucleo.listarProximos(supabase, pid, 30),
    medicamentos.calcularAdherencia(supabase, pid),
    inventarioNucleo.listarGruposSeguro(supabase, pid),
    medicamentos.listarTomasDesde(supabase, pid, desde),
    medicionesNucleo.listarRecientesSeguro(supabase, pid),
    recetasNucleo.listarProximasSeguro(supabase, pid),
  ]);

  // Stock por fila de medicamento: lo que muestra la hoja de detalle
  // ("Quedan N comp. · Alcanza N días").
  const stockPorMedicamento: Record<string, StockDetalle> = {};
  for (const g of grupos) {
    if (!g.inventario) continue;
    const dias = inventarioNucleo.diasQueAlcanza(g);
    for (const id of g.medicamentoIds) {
      stockPorMedicamento[id] = { stock: g.inventario.stock, umbral: g.inventario.umbral_alerta, dias };
    }
  }

  // Mediciones de los últimos 35 días, ya formateadas (el cliente no necesita el resto).
  const desdeAR = fechaISOEnAR(new Date(new Date().getTime() - 35 * 24 * 3600 * 1000));
  const medicionesDia: MedicionDia[] = mediciones
    .map((m) => ({ fecha: fechaISOEnAR(new Date(m.medido_at)), m }))
    .filter(({ fecha }) => fecha >= desdeAR)
    .map(({ fecha, m }) => ({
      fecha,
      hora: horaAR(m.medido_at),
      nombre: META_MEDICION[m.tipo].nombre,
      valor: formatearValor(m),
      unidad: META_MEDICION[m.tipo].unidad,
    }));

  return (
    <RutinaView
      medsHoy={medsHoy}
      todosLosMeds={todosLosMeds}
      turnosHoy={turnosHoy}
      turnosProximos={turnosProximos}
      adherencia={adherencia}
      stockPorMedicamento={stockPorMedicamento}
      tomas={tomas}
      medicionesDia={medicionesDia}
      recetas={recetas}
      hoy={hoy}
      perfil={activo}
      opciones={opciones}
    />
  );
}
