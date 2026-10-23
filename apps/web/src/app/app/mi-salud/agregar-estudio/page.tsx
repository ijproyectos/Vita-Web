import { requireUser } from "@/lib/dal";
import { redirect } from "next/navigation";
import { obtenerPerfilActivo } from "@/lib/familia/perfil-activo";
import { BannerPerfil } from "@/components/vita/banner-perfil";
import { TopBar } from "../../top-bar";
import { createClient } from "@/lib/supabase/server";
import { lugarDisponible } from "@/lib/estudios/nucleo";
import { FormularioAgregarEstudio } from "./formulario";

export default async function AgregarEstudioPage() {
  await requireUser();
  // Familia: se carga para el perfil activo; con permiso "ver" no hay alta.
  const activo = await obtenerPerfilActivo();
  if (activo.rol !== "editar") redirect("/app");

  return (
    <div className="flex flex-col gap-5 px-[18px] pt-1.5">
      <TopBar volverA="/app/mi-salud" eyebrow="Mi salud" title="Nuevo estudio" />
      <BannerPerfil perfil={activo} accion="cargar" />
      <FormularioAgregarEstudio lugarDisponible={await lugarDisponible(await createClient())} />
    </div>
  );
}
