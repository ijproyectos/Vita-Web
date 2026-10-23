import { requireUser } from "@/lib/dal";
import { TopBar } from "../../top-bar";
import { FormularioNuevoPerfil } from "./formulario";

export default async function NuevoPerfilPage() {
  await requireUser();
  return (
    <div className="flex flex-col gap-[22px] px-[18px] pt-1.5">
      <TopBar volverA="/app/familia" eyebrow="Familia" title="Crear un perfil" />
      <FormularioNuevoPerfil />
    </div>
  );
}
