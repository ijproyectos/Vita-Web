import { redirect } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { obtenerPerfilActivo } from "@/lib/familia/perfil-activo";
import { BannerPerfil } from "@/components/vita/banner-perfil";
import { esTipoMedicion, volverSeguro } from "@/lib/mediciones/tipos";
import { TopBar } from "../../../top-bar";
import { FormularioMedicion } from "./formulario";

export default async function AgregarMedicionPage(props: PageProps<"/app/mi-salud/monitoreo/agregar">) {
  await requireUser();
  // Familia: se carga para el perfil activo; con permiso "ver" no hay alta.
  const activo = await obtenerPerfilActivo();
  if (activo.rol !== "editar") redirect("/app/mi-salud/monitoreo");

  const params = await props.searchParams;
  const pedidoVolver = params?.volver;
  const volver = volverSeguro(Array.isArray(pedidoVolver) ? pedidoVolver[0] : pedidoVolver);
  const pedido = params?.tipo;
  const tipoInicial = esTipoMedicion(Array.isArray(pedido) ? pedido[0] : pedido)
    ? ((Array.isArray(pedido) ? pedido[0] : pedido) as string)
    : "presion";

  return (
    <div className="flex flex-col gap-[22px] px-[18px] pt-1.5">
      <TopBar eyebrow="Monitoreo" title="Nueva medición" volverA={volver} />
      <BannerPerfil perfil={activo} accion="cargar" />
      <FormularioMedicion tipoInicial={tipoInicial} volver={volver} />
    </div>
  );
}
