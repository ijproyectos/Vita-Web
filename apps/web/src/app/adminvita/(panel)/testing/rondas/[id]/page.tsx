import Link from "next/link";
import { entrarAlPanel } from "@/lib/admin/datos";
import { leerRonda, listarPersonas } from "@/lib/admin/testing/datos";
import { entero, estadoDeCaso, resumirRonda } from "@/lib/admin/testing/logica";
import { formatoPorcentaje } from "@/lib/admin/formato";
import { Seccion, TD, TH, Tabla, Vacio } from "../../../_componentes/ui";
import { FormularioAsignar } from "../../_componentes/campos-formularios";
import { BarraAvance, ErrorTesting, EtiquetaEstado, NoEncontrado, TARJETA, textoConteo } from "../../_componentes/comunes";
import { BotonAccion } from "../../_componentes/formularios";
import { cambiarEstadoRondaAction, quitarAsignacionAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function RondaPage({ params }: PageProps<"/adminvita/testing/rondas/[id]">) {
  const admin = await entrarAlPanel("/adminvita/testing/rondas/[id]");
  const id = entero((await params).id);
  if (id === null) return <NoEncontrado que="La ronda" />;
  const [d, personas] = await Promise.all([leerRonda(admin, id), listarPersonas(admin)]);
  if (d === null) return <ErrorTesting />;
  if (d === "no_existe") return <NoEncontrado que="La ronda" />;
  const { ronda } = d;
  const casoPorId = new Map(d.casos.map((c) => [c.id, c]));
  const r = resumirRonda(d.asignaciones, d.pruebas, casoPorId);

  const ultimaPorAsignacion = new Map<number, (typeof d.pruebas)[number]>();
  for (const p of d.pruebas) if (p.asignacion_id !== null && !ultimaPorAsignacion.has(p.asignacion_id)) ultimaPorAsignacion.set(p.asignacion_id, p);
  const activa = ronda.estado === "activa";

  // Por área y por persona: la ronda "partida por área" que se reparte entre el equipo.
  const porArea = r.porArea.map((a) => ({
    ...a,
    personas: [
      ...new Set(
        d.asignaciones
          .filter((x) => casoPorId.get(x.caso_id)?.area === a.area)
          .map((x) => x.admin_email ?? "Sin asignar"),
      ),
    ],
  }));

  return (
    <>
      <p className="mb-3 px-1 text-sm">
        <Link href="/adminvita/testing/rondas" className="font-semibold text-teal-deep underline-offset-2 hover:underline">
          ← Rondas
        </Link>
      </p>
      <div className={`${TARJETA} space-y-3`}>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-extrabold tracking-tight">{ronda.nombre}</h2>
          <EtiquetaEstado valor={ronda.estado} />
          {ronda.version_app ? <span className="text-sm text-subtle">v{ronda.version_app}</span> : null}
          <span className="text-xs text-subtle">
            {ronda.desde}
            {ronda.hasta ? ` → ${ronda.hasta}` : ""} · creada por {ronda.creada_por}
          </span>
          <span className="flex-1" />
          <BotonAccion
            accion={cambiarEstadoRondaAction.bind(null, ronda.id, activa ? "cerrada" : "activa")}
            texto={activa ? "Cerrar ronda" : "Reabrir ronda"}
            confirmar={activa ? "¿Cerrar la ronda? Ya no se podrán registrar pruebas en ella." : undefined}
          />
        </div>
        {ronda.notas ? <p className="text-sm">{ronda.notas}</p> : null}
        <div>
          <BarraAvance conteo={r.conteo} total={r.total} />
          <p className="mt-1 text-xs text-subtle">
            {r.total} asignaciones · {textoConteo(r.conteo)} · pasa {formatoPorcentaje(r.tasaOk)}
          </p>
        </div>
      </div>

      <Seccion titulo="Por área">
        {porArea.length === 0 ? (
          <Vacio>Todavía no hay casos asignados en esta ronda.</Vacio>
        ) : (
          <div className={`${TARJETA} space-y-4`}>
            {porArea.map((a) => (
              <div key={a.area}>
                <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span className="font-bold">{a.area}</span>
                  <span className="text-xs text-subtle">
                    {a.total} · {textoConteo(a.conteo)} · pasa {formatoPorcentaje(a.tasaOk)} · {a.personas.join(", ")}
                  </span>
                </div>
                <BarraAvance conteo={a.conteo} total={a.total} />
              </div>
            ))}
          </div>
        )}
      </Seccion>

      {activa ? (
        <Seccion titulo="Asignar casos">
          <FormularioAsignar rondaId={ronda.id} personas={personas} />
        </Seccion>
      ) : null}

      <Seccion titulo={`Asignaciones (${d.asignaciones.length})`}>
        {d.asignaciones.length === 0 ? (
          <Vacio>Sin asignaciones.</Vacio>
        ) : (
          <Tabla>
            <thead>
              <tr>
                <th className={TH}>Caso</th>
                <th className={TH}>Área</th>
                <th className={TH}>Quién</th>
                <th className={TH}>Dispositivo</th>
                <th className={TH}>Estado</th>
                <th className={TH}></th>
              </tr>
            </thead>
            <tbody>
              {d.asignaciones.map((a) => {
                const c = casoPorId.get(a.caso_id);
                if (!c) return null;
                return (
                  <tr key={a.id}>
                    <td className={TD}>
                      <Link href={`/adminvita/testing/casos/${c.id}`} className="font-mono font-bold underline-offset-2 hover:underline">
                        {c.codigo}
                      </Link>{" "}
                      <span className="text-xs text-subtle">{c.funcionalidad}</span>
                    </td>
                    <td className={TD}>{c.area}</td>
                    <td className={`${TD} text-xs`}>{a.admin_email ?? "Sin asignar"}</td>
                    <td className={TD}>{a.dispositivo || "—"}</td>
                    <td className={TD}>
                      <EtiquetaEstado valor={estadoDeCaso(ultimaPorAsignacion.get(a.id))} />
                    </td>
                    <td className={TD}>
                      {activa ? <BotonAccion accion={quitarAsignacionAction.bind(null, a.id)} texto="Quitar" confirmar="¿Quitar?" tono="peligro" /> : null}
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
