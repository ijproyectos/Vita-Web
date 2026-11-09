import { requireUser } from "@/lib/dal";
import { redirect } from "next/navigation";
import { obtenerPerfilActivo } from "@/lib/familia/perfil-activo";
import { BannerPerfil } from "@/components/vita/banner-perfil";
import { TopBar } from "../top-bar";
import { VitaShortcutButton } from "../vita-shortcut-button";
import { createClient } from "@/lib/supabase/server";
import { detallesDisponibles, listarEspecialidadesUsadas } from "@/lib/turnos/nucleo";
import { obtenerPerfil } from "@/lib/perfil/nucleo";
import { FormularioAgregarTurno } from "./formulario";

export default async function AgregarTurnoPage() {
  await requireUser();
  // Familia: se carga para el perfil activo; con permiso "ver" no hay alta.
  const activo = await obtenerPerfilActivo();
  if (activo.rol !== "editar") redirect("/app");

  const supabase = await createClient();
  const [llevarDisponible, especialidadesUsadas, perfil] = await Promise.all([
    detallesDisponibles(supabase),
    listarEspecialidadesUsadas(supabase, activo.id),
    obtenerPerfil(supabase, activo.id).catch(() => null),
  ]);

  return (
    <div className="flex flex-col gap-[22px] px-[18px] pt-1.5">
      <TopBar volverA="/app/rutina" eyebrow={activo.esPropio ? "Nuevo en tu rutina" : `Para ${activo.nombre}`} title="Turno médico" accionDerecha={activo.esPropio ? <VitaShortcutButton /> : undefined} />
      {/* El chat con vita actúa sobre la cuenta logueada: para otra persona no se ofrece. */}
      {activo.esPropio ? <VitaShortcutButton size="banner" /> : <BannerPerfil perfil={activo} accion="cargar" />}
      <FormularioAgregarTurno
        llevarDisponible={llevarDisponible}
        especialidadesUsadas={especialidadesUsadas}
        obraSocial={perfil?.obra_social ?? null}
        paraNombre={activo.esPropio ? undefined : activo.nombre.split(" ")[0]}
      />
    </div>
  );
}
