import { notFound } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import * as estudiosNucleo from "@/lib/estudios/nucleo";
import { TIPO_PDF } from "@/lib/estudios/tipos";
import { diaYMes } from "@/lib/rutina/formato";
import { obtenerPerfilActivo } from "@/lib/familia/perfil-activo";
import { BannerPerfil } from "@/components/vita/banner-perfil";
import { DetalleEstudio } from "./detalle";

export default async function EstudioDetallePage(props: PageProps<"/app/mi-salud/estudios/[id]">) {
  await requireUser();
  const supabase = await createClient();
  const { id } = await props.params;
  const activo = await obtenerPerfilActivo();

  const estudio = await estudiosNucleo.obtener(supabase, activo.id, id).catch(() => null);
  if (!estudio) notFound();

  const esPdf = estudio.archivo_tipo === TIPO_PDF;
  const titulo = estudio.tipo ?? "Estudio sin identificar";
  const { dia, mes } = diaYMes(estudio.fecha ?? estudio.created_at.slice(0, 10));
  const extension = esPdf ? "pdf" : (estudio.archivo_path.split(".").pop() ?? "jpg").toLowerCase();
  const nombreBase = titulo.replace(/[\\/:*?"<>|]+/g, " ").trim() || "Estudio";

  return (
    <div className="flex flex-col gap-[18px] px-[18px] pt-1.5">
      <DetalleEstudio
        puedeEditar={activo.rol === "editar"}
        banner={<BannerPerfil perfil={activo} />}
        datos={{
          id: estudio.id,
          titulo,
          meta: `${dia.padStart(2, "0")} ${mes.toLowerCase()}${estudio.fecha ? "" : " · fecha de carga"}${estudio.lugar ? ` · ${estudio.lugar}` : ""}`,
          nombreArchivo: `${nombreBase}.${extension}`,
          tipoArchivo: esPdf ? "PDF" : "FOTO",
          url: estudio.urlFirmada,
          resumen:
            estudio.resumen ??
            (estudio.estado === "error"
              ? "vita no pudo leer los datos de este archivo. Quedó guardado igual."
              : "Todavía no hay un resumen de este estudio."),
          valores: estudio.valores,
        }}
      />
    </div>
  );
}
