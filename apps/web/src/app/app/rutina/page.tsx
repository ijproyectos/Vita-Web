import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import * as medicamentos from "@/lib/medicamentos/nucleo";
import * as inventarioNucleo from "@/lib/inventario/nucleo";
import * as turnosNucleo from "@/lib/turnos/nucleo";
import { RutinaView } from "./rutina-view";

export default async function RutinaPage() {
  const usuario = await requireUser();
  const supabase = await createClient();

  const [medsHoy, todosLosMeds, turnosHoy, turnosProximos, adherencia, inventarios] = await Promise.all([
    medicamentos.listarHoy(supabase, usuario.id),
    medicamentos.listarTodos(supabase, usuario.id),
    turnosNucleo.listarDeHoy(supabase, usuario.id),
    turnosNucleo.listarProximos(supabase, usuario.id, 30),
    medicamentos.calcularAdherencia(supabase, usuario.id),
    inventarioNucleo.listarSeguro(supabase, usuario.id),
  ]);

  const stockPorInventario = Object.fromEntries(
    inventarios.map((i) => [i.id, { stock: i.stock, umbral: i.umbral_alerta }])
  );

  return (
    <RutinaView
      medsHoy={medsHoy}
      todosLosMeds={todosLosMeds}
      turnosHoy={turnosHoy}
      turnosProximos={turnosProximos}
      adherencia={adherencia}
      stockPorInventario={stockPorInventario}
    />
  );
}
