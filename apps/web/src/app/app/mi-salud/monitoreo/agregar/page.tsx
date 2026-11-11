import { redirect } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { obtenerPerfilActivo } from "@/lib/familia/perfil-activo";
import { BannerPerfil } from "@/components/vita/banner-perfil";
import { MAX_NOMBRE_OTRA, MAX_UNIDAD_OTRA, esTipoMedicion, formatearValor, metaDe, volverSeguro, type TipoRegistrable } from "@/lib/mediciones/tipos";
import { esDeLaMetrica } from "@/lib/mediciones/plan";
import * as medicionesNucleo from "@/lib/mediciones/nucleo";
import { createClient } from "@/lib/supabase/server";
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

  // "Otra" llega con su nombre desde la tarjeta, el detalle, la Rutina o el aviso.
  const texto = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
  const nombreOtra = texto(params?.tipo) === "otra" ? texto(params?.nombre).slice(0, MAX_NOMBRE_OTRA) : "";
  const unidadOtra = nombreOtra ? texto(params?.unidad).slice(0, MAX_UNIDAD_OTRA) : "";

  // Si ya se sabe qué se mide (tarjeta, Rutina, aviso) no se elige: va en el título.
  const crudo = texto(params?.tipo);
  const metricaFija = esTipoMedicion(crudo) || !!nombreOtra;
  const tipo: TipoRegistrable = nombreOtra ? "otra" : esTipoMedicion(crudo) ? crudo : "presion";
  const horaPedida = texto(params?.hora);
  // Viene de "es hora de medir" (aviso o Rutina traen la hora del plan; el modo simple manda `ahora`): se registra ahora.
  const esAhora = texto(params?.ahora) === "1" || /^\d{2}:\d{2}$/.test(horaPedida);
  const consulta = { tipo, nombre_otra: nombreOtra || null };
  const supabase = await createClient();
  const historial = metricaFija ? await medicionesNucleo.listarPorTipoSeguro(supabase, activo.id, tipo) : [];
  const ultima = historial.find((m) => esDeLaMetrica(m, consulta));
  const eyebrow = metricaFija ? `Medición · ${/^\d{2}:\d{2}$/.test(horaPedida) ? horaPedida : "ahora"}` : "Monitoreo";
  const titulo = metricaFija ? metaDe({ tipo, nombre_otra: nombreOtra, unidad_otra: unidadOtra }).nombre : "Nueva medición";

  return (
    <div className="flex flex-col gap-[22px] px-[18px] pt-1.5">
      <TopBar eyebrow={eyebrow} title={titulo} volverA={volver} />
      <BannerPerfil perfil={activo} accion="cargar" />
      <FormularioMedicion tipoInicial={tipoInicial} volver={volver} otra={nombreOtra ? { nombre: nombreOtra, unidad: unidadOtra } : null} metricaFija={metricaFija} ultimoValor={ultima ? formatearValor(ultima) : null} esAhora={esAhora} />
    </div>
  );
}
