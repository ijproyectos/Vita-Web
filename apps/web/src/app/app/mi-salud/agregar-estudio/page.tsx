import { requireUser } from "@/lib/dal";
import { TopBar } from "../../top-bar";
import { FormularioAgregarEstudio } from "./formulario";

export default async function AgregarEstudioPage() {
  await requireUser();

  return (
    <div className="flex flex-col gap-4.5 px-4 pt-2">
      <TopBar eyebrow="Mi Salud" title="Agregar estudio" />
      <FormularioAgregarEstudio />
    </div>
  );
}
