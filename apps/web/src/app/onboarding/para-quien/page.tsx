import { requireUser } from "@/lib/dal";
import { FormularioParaQuien } from "./formulario";

export default async function OnboardingParaQuienPage() {
  await requireUser();
  return <FormularioParaQuien />;
}
