import { requireUser } from "@/lib/dal";
import { redirect } from "next/navigation";
import { obtenerPerfilActivo } from "@/lib/familia/perfil-activo";
import { BannerPerfil } from "@/components/vita/banner-perfil";
import { TopBar } from "../../top-bar";
import { FormularioAgregarEstudio } from "./formulario";

export default async function AgregarEstudioPage() {
  await requireUser();
  // Familia: se carga para el perfil activo; con permiso "ver" no hay alta.
  const activo = await obtenerPerfilActivo();
  if (activo.rol !== "editar") redirect("/app");

  return (
    <div className="flex flex-col gap-4.5 px-4 pt-2">
      <TopBar eyebrow="Mi Salud" title="Agregar estudio" />
      <BannerPerfil perfil={activo} accion="cargar" />
      <FormularioAgregarEstudio />
    </div>
  );
}
