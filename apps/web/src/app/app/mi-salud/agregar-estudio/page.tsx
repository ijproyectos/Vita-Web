import { requireUser } from "@/lib/dal";
import { redirect } from "next/navigation";
import { obtenerPerfilActivo } from "@/lib/familia/perfil-activo";
import { BannerPerfil } from "@/components/vita/banner-perfil";
import { TopBar } from "../../top-bar";
import { createClient } from "@/lib/supabase/server";
import { lugarDisponible } from "@/lib/estudios/nucleo";
import { cuotaEstudios } from "@/lib/plan-gratis/nucleo";
import { textoCuotaEstudios } from "@/lib/plan-gratis/logica";
import { LineaCupoPlan, TarjetaLimitePlan } from "@/components/vita/tarjeta-limite-plan";
import { FormularioAgregarEstudio } from "./formulario";

export default async function AgregarEstudioPage() {
  await requireUser();
  // Familia: se carga para el perfil activo; con permiso "ver" no hay alta.
  const activo = await obtenerPerfilActivo();
  if (activo.rol !== "editar") redirect("/app");
  const supabase = await createClient();
  const cuota = await cuotaEstudios(supabase, activo.id);

  return (
    <div className="flex flex-col gap-5 px-[18px] pt-1.5">
      <TopBar volverA="/app/mi-salud" eyebrow={activo.esPropio ? "Mi salud" : `Salud de ${activo.nombre.split(" ")[0]}`} title="Nuevo estudio" />
      <BannerPerfil perfil={activo} accion="cargar" />
      {cuota.limitada && cuota.alcanzada ? (
        <TarjetaLimitePlan
          titulo="Este mes ya cargaste tu estudio"
          texto="El plan gratis incluye 1 estudio por mes. Con vita+ podés cargar todos los que necesites, con lectura automática."
        />
      ) : (
        <>
          <LineaCupoPlan texto={textoCuotaEstudios(cuota)} />
          <FormularioAgregarEstudio lugarDisponible={await lugarDisponible(supabase)} />
        </>
      )}
    </div>
  );
}
