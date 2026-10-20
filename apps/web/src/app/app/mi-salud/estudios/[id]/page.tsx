import { notFound } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import * as estudiosNucleo from "@/lib/estudios/nucleo";
import { TIPO_PDF } from "@/lib/estudios/tipos";
import { formatoFechaCorta } from "@/lib/rutina/formato";
import { VitaIcon } from "@/lib/vita-icons";
import { TopBar } from "../../../top-bar";
import { obtenerPerfilActivo } from "@/lib/familia/perfil-activo";
import { BannerPerfil } from "@/components/vita/banner-perfil";

export default async function EstudioDetallePage(props: PageProps<"/app/mi-salud/estudios/[id]">) {
  await requireUser();
  const supabase = await createClient();
  const { id } = await props.params;
  const activo = await obtenerPerfilActivo();

  const estudio = await estudiosNucleo.obtener(supabase, activo.id, id).catch(() => null);
  if (!estudio) notFound();

  const esPdf = estudio.archivo_tipo === TIPO_PDF;

  return (
    <div className="flex flex-col gap-4.5 px-4 pt-2">
      <TopBar eyebrow="Estudio" title={estudio.tipo ?? "Estudio sin identificar"} />
      <BannerPerfil perfil={activo} />

      <div className="rounded-[20px] bg-card p-4.5 shadow-card">
        <div className="text-xs text-muted-foreground">
          {formatoFechaCorta(estudio.fecha ?? estudio.created_at.slice(0, 10))}
          {!estudio.fecha && " (fecha de carga)"}
        </div>
        {estudio.resumen && <p className="mt-2 text-sm">{estudio.resumen}</p>}
        {estudio.estado === "error" && (
          <p className="mt-2 text-xs font-semibold text-primary">
            vita no pudo leer los datos de este archivo — quedó guardado igual.
          </p>
        )}
      </div>

      {estudio.valores.length > 0 && (
        <div className="rounded-[20px] bg-card p-4.5 shadow-card">
          <div className="font-heading text-[15px] font-bold">Valores</div>
          <dl className="mt-2.5 flex flex-col gap-2">
            {estudio.valores.map((v, i) => (
              <div key={`${v.nombre}-${i}`} className="flex items-baseline justify-between gap-3 text-sm">
                <dt className="text-muted-foreground">{v.nombre}</dt>
                <dd className="text-right font-semibold">{v.valor}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <div className="rounded-[20px] bg-card p-4.5 shadow-card">
        <div className="font-heading text-[15px] font-bold">Archivo original</div>
        {estudio.urlFirmada ? (
          <>
            {!esPdf && (
              // eslint-disable-next-line @next/next/no-img-element -- URL firmada temporal de Storage privado, no un asset de Next
              <img src={estudio.urlFirmada} alt="Foto del estudio" className="mt-3 w-full rounded-[14px] object-contain" />
            )}
            <a
              href={estudio.urlFirmada}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 flex items-center justify-center gap-2 rounded-full bg-secondary py-2.5 font-heading text-[13.5px] font-bold text-primary"
            >
              <VitaIcon name={esPdf ? "doc" : "camera"} size={16} /> {esPdf ? "Abrir PDF" : "Ver foto completa"}
            </a>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">El enlace es temporal (1 hora).</p>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">No se pudo generar el enlace al archivo. Probá de nuevo.</p>
        )}
      </div>
    </div>
  );
}
