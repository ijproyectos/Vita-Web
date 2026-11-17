import Link from "next/link";
import { entrarAlPanel } from "@/lib/admin/datos";
import { cargarTesting } from "@/lib/admin/testing/datos";
import { Seccion, TD, TH, Tabla, Vacio } from "../../_componentes/ui";
import { FormularioReporte } from "../_componentes/campos-formularios";
import { ErrorTesting, EtiquetaEstado } from "../_componentes/comunes";

export const dynamic = "force-dynamic";

export default async function ReportesPage() {
  const admin = await entrarAlPanel("/adminvita/testing/reportes");
  const datos = await cargarTesting(admin);
  if (!datos) return <ErrorTesting />;
  const bugPorId = new Map(datos.bugs.map((b) => [b.id, b]));

  return (
    <>
      <p className="mb-3 max-w-2xl px-1 text-sm text-slate-brand">Lo que cuentan los testers por WhatsApp, mail o en persona. Desde cada reporte se puede abrir un bug.</p>
      {datos.reportes.length === 0 ? (
        <Vacio>Todavía no hay reportes.</Vacio>
      ) : (
        <Tabla>
          <thead>
            <tr>
              <th className={TH}>Reporte</th>
              <th className={TH}>Fecha</th>
              <th className={TH}>Quién</th>
              <th className={TH}>Canal</th>
              <th className={TH}>Área</th>
              <th className={TH}>Qué pasó</th>
              <th className={TH}>Severidad</th>
              <th className={TH}>Estado</th>
              <th className={TH}>Bug</th>
            </tr>
          </thead>
          <tbody>
            {datos.reportes.map((r) => (
              <tr key={r.id}>
                <td className={`${TD} font-mono font-bold`}>
                  <Link href={`/adminvita/testing/reportes/${r.id}`} className="underline-offset-2 hover:underline">
                    {r.codigo}
                  </Link>
                </td>
                <td className={`${TD} text-xs`}>{r.fecha}</td>
                <td className={`${TD} text-xs`}>{r.reportante || "—"}</td>
                <td className={`${TD} text-xs`}>{r.canal}</td>
                <td className={`${TD} text-xs`}>{r.area}</td>
                <td className={TD}>
                  <span className="block max-w-[280px] truncate">{r.paso}</span>
                </td>
                <td className={TD}>
                  <EtiquetaEstado valor={r.severidad} />
                </td>
                <td className={TD}>
                  <EtiquetaEstado valor={r.estado} />
                </td>
                <td className={`${TD} font-mono text-xs`}>{r.bug_id !== null ? (bugPorId.get(r.bug_id)?.codigo ?? "—") : "—"}</td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
      <Seccion titulo="Cargar un reporte">
        <FormularioReporte />
      </Seccion>
    </>
  );
}
