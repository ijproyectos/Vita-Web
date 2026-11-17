import Link from "next/link";
import { entrarAlPanel } from "@/lib/admin/datos";
import { leerReporte } from "@/lib/admin/testing/datos";
import { entero } from "@/lib/admin/testing/logica";
import { Seccion } from "../../../_componentes/ui";
import { Adjuntos } from "../../_componentes/adjuntos";
import { FormularioReporte } from "../../_componentes/campos-formularios";
import { ErrorTesting, EtiquetaEstado, NoEncontrado, TARJETA } from "../../_componentes/comunes";
import { BotonAccion } from "../../_componentes/formularios";
import { crearBugDesdeReporteAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function ReportePage({ params }: PageProps<"/adminvita/testing/reportes/[id]">) {
  const admin = await entrarAlPanel("/adminvita/testing/reportes/[id]");
  const id = entero((await params).id);
  if (id === null) return <NoEncontrado que="El reporte" />;
  const d = await leerReporte(admin, id);
  if (d === null) return <ErrorTesting />;
  if (d === "no_existe") return <NoEncontrado que="El reporte" />;
  const { reporte } = d;

  return (
    <>
      <p className="mb-3 px-1 text-sm">
        <Link href="/adminvita/testing/reportes" className="font-semibold text-teal-deep underline-offset-2 hover:underline">
          ← Reportes de testers
        </Link>
      </p>
      <div className={`${TARJETA} flex flex-wrap items-center gap-3`}>
        <span className="font-mono text-lg font-extrabold">{reporte.codigo}</span>
        <EtiquetaEstado valor={reporte.estado} />
        <EtiquetaEstado valor={reporte.severidad} />
        <span className="flex-1" />
        {d.bug ? (
          <Link href={`/adminvita/testing/bugs/${d.bug.id}`} className="text-sm font-bold text-teal-deep underline">
            Bug {d.bug.codigo}
          </Link>
        ) : (
          <BotonAccion accion={crearBugDesdeReporteAction.bind(null, reporte.id)} texto="Crear bug desde este reporte" tono="primario" irA="/adminvita/testing/bugs/" />
        )}
      </div>

      <Seccion titulo="Detalle">
        <FormularioReporte reporte={reporte} />
      </Seccion>

      <Seccion titulo="Capturas y videos">
        <div className={TARJETA}>
          <Adjuntos tipo="reporte" id={reporte.id} adjuntos={d.adjuntos} />
        </div>
      </Seccion>
    </>
  );
}
