import Link from "next/link";
import { entrarAlPanel } from "@/lib/admin/datos";
import { misAsignaciones } from "@/lib/admin/testing/datos";
import { estadoDeCaso, type EstadoCaso } from "@/lib/admin/testing/logica";
import { Seccion, Vacio } from "../../_componentes/ui";
import { FormularioPrueba } from "../_componentes/campos-formularios";
import { ErrorTesting, EtiquetaEstado, TARJETA } from "../_componentes/comunes";
import { BotonAccion } from "../_componentes/formularios";
import { crearBugDesdePruebaAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function MisPruebasPage() {
  const admin = await entrarAlPanel("/adminvita/testing/mis-pruebas");
  const mias = await misAsignaciones(admin);
  if (!mias) return <ErrorTesting />;

  const porRonda = new Map<number, typeof mias>();
  for (const m of mias) porRonda.set(m.ronda.id, [...(porRonda.get(m.ronda.id) ?? []), m]);
  const pendientes = mias.filter((m) => estadoDeCaso(m.ultima ?? undefined) === "Pendiente").length;

  return (
    <>
      <p className="mb-3 max-w-2xl px-1 text-sm text-slate-brand">
        Lo que te tocó probar ({admin.email}) en las rondas activas. {mias.length > 0 ? `${pendientes} de ${mias.length} pendientes.` : ""}
      </p>
      {mias.length === 0 ? (
        <Vacio>No tenés pruebas asignadas en rondas activas. Se reparten desde Rondas.</Vacio>
      ) : (
        [...porRonda.values()].map((lista) => {
          const ronda = lista[0].ronda;
          const porArea = new Map<string, typeof lista>();
          for (const m of lista) porArea.set(m.caso.area, [...(porArea.get(m.caso.area) ?? []), m]);
          return (
            <Seccion key={ronda.id} titulo={`${ronda.nombre}${ronda.version_app ? ` · v${ronda.version_app}` : ""}`}>
              <div className="space-y-6">
                {[...porArea.entries()].map(([area, items]) => (
                  <div key={area}>
                    <h3 className="mb-2 px-1 text-sm font-extrabold text-slate-brand">{area}</h3>
                    <ul className="space-y-3">
                      {items.map(({ asignacion, caso, ultima }) => {
                        const estado: EstadoCaso = estadoDeCaso(ultima ?? undefined);
                        return (
                          <li key={asignacion.id} className={TARJETA}>
                            <div className="flex flex-wrap items-center gap-2">
                              <Link href={`/adminvita/testing/casos/${caso.id}`} className="font-mono font-bold underline-offset-2 hover:underline">
                                {caso.codigo}
                              </Link>
                              <span className="font-semibold">{caso.funcionalidad}</span>
                              <EtiquetaEstado valor={estado} />
                              {asignacion.dispositivo ? <span className="text-xs text-subtle">{asignacion.dispositivo}</span> : null}
                              <span className="flex-1" />
                              {ultima?.estado === "Falla" && ultima.bug_id === null ? (
                                <BotonAccion accion={crearBugDesdePruebaAction.bind(null, ultima.id)} texto="Crear bug de esta falla" tono="primario" irA="/adminvita/testing/bugs/" />
                              ) : null}
                              {ultima?.bug_id ? (
                                <Link href={`/adminvita/testing/bugs/${ultima.bug_id}`} className="text-xs font-bold text-teal-deep underline">
                                  Ver bug
                                </Link>
                              ) : null}
                            </div>
                            <details className="mt-3">
                              <summary className="cursor-pointer text-xs font-bold text-teal-deep">Pasos y registrar resultado</summary>
                              <div className="mt-3 space-y-3 text-sm">
                                {caso.precondicion ? (
                                  <p>
                                    <strong className="text-xs text-slate-brand">Antes: </strong>
                                    {caso.precondicion}
                                  </p>
                                ) : null}
                                <p className="whitespace-pre-line">{caso.pasos}</p>
                                <p>
                                  <strong className="text-xs text-slate-brand">Esperado: </strong>
                                  {caso.esperado}
                                </p>
                                <FormularioPrueba casoId={caso.id} asignacionId={asignacion.id} dispositivo={asignacion.dispositivo} />
                              </div>
                            </details>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </Seccion>
          );
        })
      )}
    </>
  );
}
