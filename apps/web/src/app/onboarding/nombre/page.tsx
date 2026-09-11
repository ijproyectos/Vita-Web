import { requireUser } from "@/lib/dal";
import { FormularioNombre } from "./formulario";

export default async function OnboardingNombrePage() {
  await requireUser();
  return <FormularioNombre />;
}
