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
import { formatearValor, hrefNuevaMedicion, metaDe } from "@/lib/mediciones/tipos";
import * as planesNucleo from "@/lib/mediciones/planes-nucleo";
import { esDeLaMetrica, fraseMedir, planAplica, tramosDeHoy } from "@/lib/mediciones/plan";
import { diaSemanaDe } from "@/lib/medicamentos/nucleo";
import { RutinaView } from "./rutina-view";
import type { StockDetalle } from "./detalle-medicamento";
import type { MedicionDia } from "./historial-view";
import type { ItemMedir } from "./tipos";

export default async function RutinaPage() {
  await requireUser();
  const supabase = await createClient();
  const [activo, opciones] = await Promise.all([obtenerPerfilActivo(), obtenerOpcionesPerfil()]);
  const pid = activo.id;

  // Las tomas se indexan por fecha AR (ver lib/rutina/historial.ts): "hoy"
  // del calendario es el mismo día que usa `listarHoy`.
  const hoy = medicamentos.fechaEnAR();
  const desde = inicioCalendario(hoy);

  const [medsHoy, todosLosMeds, turnosHoy, turnosProximos, adherencia, grupos, tomas, mediciones, planes, recetas] = await Promise.all([
    medicamentos.listarHoy(supabase, pid),
    medicamentos.listarTodos(supabase, pid),
    turnosNucleo.listarDeHoy(supabase, pid),
    turnosNucleo.listarProximos(supabase, pid, 30),
    medicamentos.calcularAdherencia(supabase, pid),
    inventarioNucleo.listarGruposSeguro(supabase, pid),
    medicamentos.listarTomasDesde(supabase, pid, desde),
    medicionesNucleo.listarRecientesSeguro(supabase, pid),
    planesNucleo.listarSeguro(supabase, pid),
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
      nombre: metaDe(m).nombre,
      valor: formatearValor(m),
      unidad: metaDe(m).unidad,
    }));

  // "Medir…" de hoy: un item por horario de cada plan vigente.
  const dia = diaSemanaDe(new Date());
  const delDia = mediciones.filter((m) => fechaISOEnAR(new Date(m.medido_at)) === hoy);
  const medirHoy: ItemMedir[] = planes
    .filter((p) => planAplica(p, dia, hoy))
    .flatMap((p) => {
      const meta = metaDe(p);
      return tramosDeHoy(p.horarios, delDia.filter((m) => esDeLaMetrica(m, p))).map((t) => ({
        clave: `${p.id}-${t.hora}`,
        hora: t.hora,
        titulo: `Medir ${fraseMedir(p)}`,
        valor: t.medicion ? `${formatearValor(t.medicion)} ${meta.unidad}`.trim() : null,
        href: hrefNuevaMedicion({ tipo: p.tipo, nombre: p.nombre_otra, unidad: p.unidad_otra, volver: "/app/rutina" }),
      }));
    });

  return (
    <RutinaView
      medirHoy={medirHoy}
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
