import Link from "next/link";
import { entrarAlPanel } from "@/lib/admin/datos";
import { cargarTesting, listarAsignaciones, listarRondas } from "@/lib/admin/testing/datos";
import { resumirRonda } from "@/lib/admin/testing/logica";
import { formatoPorcentaje } from "@/lib/admin/formato";
import { Seccion, TD, TH, Tabla, Vacio } from "../../_componentes/ui";
import { FormularioRonda } from "../_componentes/campos-formularios";
import { BarraAvance, ErrorTesting, EtiquetaEstado } from "../_componentes/comunes";

export const dynamic = "force-dynamic";

export default async function RondasPage() {
  const admin = await entrarAlPanel("/adminvita/testing/rondas");
  const [rondas, asignaciones, datos] = await Promise.all([listarRondas(admin), listarAsignaciones(admin), cargarTesting(admin)]);
  if (!rondas || !asignaciones || !datos) return <ErrorTesting />;
  const casoPorId = new Map(datos.casos.map((c) => [c.id, c]));

  return (
    <>
      <p className="mb-3 max-w-2xl px-1 text-sm text-slate-brand">
        Una ronda arma un lote de casos para una versión de la app y los reparte entre administradores, por área o caso por caso. Cada
        persona ve lo suyo en «Mis pruebas».
      </p>
      <Seccion titulo="Nueva ronda">
        <FormularioRonda />
      </Seccion>
      <Seccion titulo="Rondas">
        {rondas.length === 0 ? (
          <Vacio>Todavía no hay rondas.</Vacio>
        ) : (
          <Tabla>
            <thead>
              <tr>
                <th className={TH}>Ronda</th>
                <th className={TH}>Versión</th>
                <th className={TH}>Estado</th>
                <th className={TH}>Fechas</th>
                <th className={TH}>Avance</th>
              </tr>
            </thead>
            <tbody>
              {rondas.map((r) => {
                const res = resumirRonda(
                  asignaciones.filter((a) => a.ronda_id === r.id),
                  datos.pruebas.filter((p) => p.ronda_id === r.id),
                  casoPorId,
                );
                return (
                  <tr key={r.id}>
                    <td className={`${TD} font-bold`}>
                      <Link href={`/adminvita/testing/rondas/${r.id}`} className="underline-offset-2 hover:underline">
                        {r.nombre}
                      </Link>
                    </td>
                    <td className={TD}>{r.version_app || "—"}</td>
                    <td className={TD}>
                      <EtiquetaEstado valor={r.estado} />
                    </td>
                    <td className={`${TD} text-xs`}>
                      {r.desde}
                      {r.hasta ? ` → ${r.hasta}` : ""}
                    </td>
                    <td className={`${TD} min-w-[180px]`}>
                      <BarraAvance conteo={res.conteo} total={res.total} />
                      <span className="text-xs text-subtle">
                        {res.total - res.conteo.Pendiente}/{res.total} · pasa {formatoPorcentaje(res.tasaOk)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Tabla>
        )}
      </Seccion>
    </>
  );
}
