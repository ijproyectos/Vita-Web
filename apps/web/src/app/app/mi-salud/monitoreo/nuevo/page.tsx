import { redirect } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { obtenerPerfilActivo } from "@/lib/familia/perfil-activo";
import { BannerPerfil } from "@/components/vita/banner-perfil";
import * as planesNucleo from "@/lib/mediciones/planes-nucleo";
import { TIPOS_PLAN, claveNombreOtra, esTipoMedicion, volverSeguro } from "@/lib/mediciones/tipos";
import { TopBar } from "../../../top-bar";
import { FormularioMonitoreo } from "./formulario";

const primero = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function NuevoMonitoreoPage(props: PageProps<"/app/mi-salud/monitoreo/nuevo">) {
  await requireUser();
  const activo = await obtenerPerfilActivo();
  if (activo.rol !== "editar") redirect("/app/mi-salud/monitoreo");

  const params = await props.searchParams;
  const volver = volverSeguro(primero(params?.volver));
  const pedido = primero(params?.tipo);
  const tipo = esTipoMedicion(pedido) && TIPOS_PLAN.includes(pedido) ? pedido : "presion";
  const nombre = "";

  // Con un plan ya guardado para esa métrica, se abre para cambiarlo.
  const supabase = await createClient();
  const planes = await planesNucleo.listarSeguro(supabase, activo.id);
  const existente = planes.find((p) => p.tipo === tipo && claveNombreOtra(p.nombre_otra) === claveNombreOtra(nombre)) ?? null;

  return (
    <div className="flex flex-col gap-[22px] px-[18px] pt-1.5">
      <TopBar eyebrow="Monitoreo" title={existente ? "Cambiar monitoreo" : "Nuevo monitoreo"} volverA={volver} />
      <BannerPerfil perfil={activo} accion="cargar" />
      <FormularioMonitoreo
        tipoInicial={tipo}
        nombreInicial={nombre}
        existente={existente}
        volver={volver}
        paraNombre={activo.esPropio ? undefined : activo.nombre.split(" ")[0]}
      />
    </div>
  );
}
