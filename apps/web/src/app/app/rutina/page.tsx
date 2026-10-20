import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import * as medicamentos from "@/lib/medicamentos/nucleo";
import * as inventarioNucleo from "@/lib/inventario/nucleo";
import * as turnosNucleo from "@/lib/turnos/nucleo";
import { obtenerOpcionesPerfil, obtenerPerfilActivo } from "@/lib/familia/perfil-activo";
import { RutinaView } from "./rutina-view";

export default async function RutinaPage() {
  await requireUser();
  const supabase = await createClient();
  const [activo, opciones] = await Promise.all([obtenerPerfilActivo(), obtenerOpcionesPerfil()]);
  const pid = activo.id;

  const [medsHoy, todosLosMeds, turnosHoy, turnosProximos, adherencia, inventarios] = await Promise.all([
    medicamentos.listarHoy(supabase, pid),
    medicamentos.listarTodos(supabase, pid),
    turnosNucleo.listarDeHoy(supabase, pid),
    turnosNucleo.listarProximos(supabase, pid, 30),
    medicamentos.calcularAdherencia(supabase, pid),
    inventarioNucleo.listarSeguro(supabase, pid),
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
      perfil={activo}
      opciones={opciones}
    />
  );
}
