import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import * as medicamentos from "@/lib/medicamentos/nucleo";
import * as turnosNucleo from "@/lib/turnos/nucleo";
import { RutinaView } from "./rutina-view";

export default async function RutinaPage() {
  const usuario = await requireUser();
  const supabase = await createClient();

  const [medsHoy, todosLosMeds, turnosHoy, turnosProximos, adherencia] = await Promise.all([
    medicamentos.listarHoy(supabase, usuario.id),
    medicamentos.listarTodos(supabase, usuario.id),
    turnosNucleo.listarDeHoy(supabase, usuario.id),
    turnosNucleo.listarProximos(supabase, usuario.id, 30),
    medicamentos.calcularAdherencia(supabase, usuario.id),
  ]);

  return (
    <RutinaView
      medsHoy={medsHoy}
      todosLosMeds={todosLosMeds}
      turnosHoy={turnosHoy}
      turnosProximos={turnosProximos}
      adherencia={adherencia}
    />
  );
}
