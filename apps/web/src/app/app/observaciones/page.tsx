import { ListaObservaciones } from "@/components/vita/observaciones-ui";
import { requireUser } from "@/lib/dal";
import { obtenerPerfilActivo } from "@/lib/familia/perfil-activo";
import { aItemsObservacion } from "@/lib/observaciones/items";
import { listarObservaciones } from "@/lib/observaciones/nucleo";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "../top-bar";

// Todo lo que vita notó en los datos de la persona que se está viendo (observaciones por reglas, sin IA). Un Lector
// las ve pero no las descarta. Sin la migración 062 la lista queda vacía.
export default async function ObservacionesPage() {
  await requireUser();
  const supabase = await createClient();
  const activo = await obtenerPerfilActivo();
  const lista = await listarObservaciones(supabase, activo.id);
  const nombre = activo.esPropio ? null : activo.nombre.split(" ")[0];

  return (
    <div className="flex flex-col gap-[18px] px-[18px] pb-8 pt-1.5">
      <TopBar volverA="/app" eyebrow={nombre ? `De ${nombre}` : "Para vos"} title="Lo que vita notó" />
      <p className="px-0.5 text-pretty text-[13px] font-medium leading-[1.45] text-subtle">
        Son avisos que vita arma mirando tus datos con reglas simples. No son un diagnóstico: ante cualquier duda, consultalo con tu médico.
      </p>
      <ListaObservaciones items={aItemsObservacion(lista)} puedeDescartar={activo.rol === "editar"} />
    </div>
  );
}
