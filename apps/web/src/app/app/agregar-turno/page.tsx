import { requireUser } from "@/lib/dal";
import { TopBar } from "../top-bar";
import { VitaShortcutButton } from "../vita-shortcut-button";
import { FormularioAgregarTurno } from "./formulario";

export default async function AgregarTurnoPage() {
  await requireUser();

  return (
    <div className="flex flex-col gap-4.5 px-4 pt-2">
      <TopBar eyebrow="Rutina" title="Agregar turno" accionDerecha={<VitaShortcutButton />} />
      <VitaShortcutButton size="banner" />
      <FormularioAgregarTurno />
    </div>
  );
}
