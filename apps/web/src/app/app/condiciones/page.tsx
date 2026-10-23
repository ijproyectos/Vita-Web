import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import * as perfilNucleo from "@/lib/perfil/nucleo";
import { obtenerPerfilActivo } from "@/lib/familia/perfil-activo";
import { BannerPerfil } from "@/components/vita/banner-perfil";
import { TopBar } from "../top-bar";
import { CondicionesView } from "./vista";

// Condiciones y alergias (V7): dos pestañas, edición y baja en la propia fila,
// alta con sugerencias. Ver (Perfil → Mi salud → Condiciones y alergias).
export default async function CondicionesPage() {
  await requireUser();
  const supabase = await createClient();
  const activo = await obtenerPerfilActivo();
  const perfil = await perfilNucleo.obtenerPerfil(supabase, activo.id).catch(() => null);

  return (
    <div className="flex flex-col gap-5 px-[18px] pb-10 pt-1.5">
      <TopBar volverA="/app/mi-salud" eyebrow="Mi estado" title="Condiciones y alergias" />
      <BannerPerfil perfil={activo} />
      <CondicionesView
        condiciones={perfil?.condiciones ?? []}
        alergias={perfil?.alergias ?? []}
        puedeEditar={activo.rol === "editar"}
      />
    </div>
  );
}
