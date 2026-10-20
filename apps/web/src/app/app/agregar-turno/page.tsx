import { requireUser } from "@/lib/dal";
import { redirect } from "next/navigation";
import { obtenerPerfilActivo } from "@/lib/familia/perfil-activo";
import { BannerPerfil } from "@/components/vita/banner-perfil";
import { TopBar } from "../top-bar";
import { VitaShortcutButton } from "../vita-shortcut-button";
import { FormularioAgregarTurno } from "./formulario";

export default async function AgregarTurnoPage() {
  await requireUser();
  // Familia: se carga para el perfil activo; con permiso "ver" no hay alta.
  const activo = await obtenerPerfilActivo();
  if (activo.rol !== "editar") redirect("/app");

  return (
    <div className="flex flex-col gap-[22px] px-[18px] pt-1.5">
      <TopBar eyebrow="Rutina" title="Agregar turno" accionDerecha={activo.esPropio ? <VitaShortcutButton /> : undefined} />
      {/* El chat con vita actúa sobre la cuenta logueada: para otra persona no se ofrece. */}
      {activo.esPropio ? <VitaShortcutButton size="banner" /> : <BannerPerfil perfil={activo} accion="cargar" />}
      <FormularioAgregarTurno />
    </div>
  );
}
