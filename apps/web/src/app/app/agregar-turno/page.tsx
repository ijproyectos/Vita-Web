import { requireUser } from "@/lib/dal";
import { TopBar } from "../top-bar";
import { VitaShortcutButton } from "../vita-shortcut-button";
import { FormularioAgregarTurno } from "./formulario";

export default async function AgregarTurnoPage() {
  await requireUser();

  return (
    <div className="flex flex-col gap-[22px] px-[18px] pt-1.5">
      <TopBar eyebrow="Rutina" title="Agregar turno" accionDerecha={<VitaShortcutButton />} />
      <VitaShortcutButton size="banner" />
      <FormularioAgregarTurno />
    </div>
  );
}
