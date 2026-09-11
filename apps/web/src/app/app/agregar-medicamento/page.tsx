import { requireUser } from "@/lib/dal";
import { TopBar } from "../top-bar";
import { VitaShortcutButton } from "../vita-shortcut-button";
import { FormularioAgregarMedicamento } from "./formulario";

export default async function AgregarMedicamentoPage() {
  await requireUser();

  return (
    <div className="flex flex-col gap-4.5 px-4 pt-2">
      <TopBar eyebrow="Rutina" title="Agregar medicamento" accionDerecha={<VitaShortcutButton />} />
      <VitaShortcutButton size="banner" />
      <FormularioAgregarMedicamento />
    </div>
  );
}
