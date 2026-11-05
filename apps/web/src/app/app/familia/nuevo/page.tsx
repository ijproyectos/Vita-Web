import { requireUser } from "@/lib/dal";
import { FormularioNuevoPerfil } from "./formulario";

export default async function NuevoPerfilPage() {
  await requireUser();
  return <FormularioNuevoPerfil />;
}
