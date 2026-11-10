import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { obtenerPerfilActivo, rolSobre } from "@/lib/familia/perfil-activo";
import { BannerPerfil } from "@/components/vita/banner-perfil";
import { detallesDisponibles, duenioDeTurno, listarEspecialidadesUsadas, obtenerPorId } from "@/lib/turnos/nucleo";
import { obtenerPerfil } from "@/lib/perfil/nucleo";
import { TopBar } from "../../../top-bar";
import { FormularioEditarTurno } from "./formulario";

// Editar un turno con la misma pantalla del alta. Escribe sobre el DUEÑO del
// turno y exige permiso "editar" (la acción lo vuelve a verificar).
export default async function EditarTurnoPage(props: PageProps<"/app/turnos/[id]/editar">) {
  const usuario = await requireUser();
  const { id } = await props.params;
  const supabase = await createClient();
  const duenio = await duenioDeTurno(supabase, id);
  if (!duenio) notFound();
  if ((await rolSobre(duenio)) !== "editar") redirect("/app/turnos");

  const activo = await obtenerPerfilActivo();
  const [turno, llevarDisponible, especialidadesUsadas, perfil] = await Promise.all([
    obtenerPorId(supabase, duenio, id),
    detallesDisponibles(supabase),
    listarEspecialidadesUsadas(supabase, duenio),
    obtenerPerfil(supabase, duenio).catch(() => null),
  ]);
  if (!turno) notFound();
  // Turno de otra persona: se nombra (y se muestra su banner) si es la que está abierta.
  const esDeOtro = duenio !== usuario.id;
  const nombreOtro = esDeOtro && activo.id === duenio ? activo.nombre : null;

  return (
    <div className="flex flex-col gap-[22px] px-[18px] pt-1.5">
      <TopBar volverA="/app/turnos" eyebrow={nombreOtro ? `Turno de ${nombreOtro}` : esDeOtro ? "Turno de tu familia" : "Tu turno"} title="Editar turno" />
      {nombreOtro && <BannerPerfil perfil={activo} accion="cargar" />}
      <FormularioEditarTurno
        turno={turno}
        llevarDisponible={llevarDisponible}
        especialidadesUsadas={especialidadesUsadas}
        obraSocial={perfil?.obra_social ?? null}
        paraNombre={nombreOtro ? nombreOtro.split(" ")[0] : undefined}
      />
    </div>
  );
}
