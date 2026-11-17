import Link from "next/link";
import { entrarAlPanel } from "@/lib/admin/datos";
import { leerCaso } from "@/lib/admin/testing/datos";
import { entero } from "@/lib/admin/testing/logica";
import { Seccion } from "../../../_componentes/ui";
import { Adjuntos } from "../../_componentes/adjuntos";
import { FormularioPrueba } from "../../_componentes/campos-formularios";
import { ErrorTesting, EtiquetaEstado, NoEncontrado, TARJETA } from "../../_componentes/comunes";
import { BotonAccion } from "../../_componentes/formularios";
import { crearBugDesdePruebaAction } from "../../actions";

export const dynamic = "force-dynamic";

function Bloque({ titulo, texto }: { titulo: string; texto: string }) {
  if (!texto.trim()) return null;
  return (
    <div>
      <p className="text-xs font-bold text-slate-brand">{titulo}</p>
      <p className="whitespace-pre-line text-sm text-ink">{texto}</p>
    </div>
  );
}

export default async function CasoPage({ params }: PageProps<"/adminvita/testing/casos/[id]">) {
  const admin = await entrarAlPanel("/adminvita/testing/casos/[id]");
  const id = entero((await params).id);
  if (id === null) return <NoEncontrado que="El caso" />;
  const d = await leerCaso(admin, id);
  if (d === null) return <ErrorTesting />;
  if (d === "no_existe") return <NoEncontrado que="El caso" />;
  const { caso } = d;

  return (
    <>
      <p className="mb-3 px-1 text-sm">
        <Link href="/adminvita/testing/casos" className="font-semibold text-teal-deep underline-offset-2 hover:underline">
          ← Casos
        </Link>
      </p>
      <div className={`${TARJETA} space-y-3`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-lg font-extrabold">{caso.codigo}</span>
          <span className="text-lg font-extrabold">{caso.funcionalidad}</span>
          <EtiquetaEstado valor={caso.prioridad} />
          <span className="text-xs text-subtle">{caso.area}</span>
        </div>
        <Bloque titulo="Precondición" texto={caso.precondicion} />
        <Bloque titulo="Pasos" texto={caso.pasos} />
        <Bloque titulo="Resultado esperado" texto={caso.esperado} />
      </div>

      <Seccion titulo="Registrar una prueba">
        <div className={TARJETA}>
          <FormularioPrueba casoId={caso.id} />
        </div>
      </Seccion>

      <Seccion titulo={`Pruebas (${d.pruebas.length})`}>
        {d.pruebas.length === 0 ? (
          <p className={`${TARJETA} text-sm text-subtle`}>Nadie probó este caso todavía.</p>
        ) : (
          <ul className="space-y-3">
            {d.pruebas.map((p) => (
              <li key={p.id} className={TARJETA}>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <EtiquetaEstado valor={p.estado} />
                  <span className="font-semibold">{p.admin_email}</span>
                  <span className="text-xs text-subtle">
                    {p.fecha}
                    {p.dispositivo ? ` · ${p.dispositivo}` : ""}
                  </span>
                  <span className="flex-1" />
                  {p.bug_id !== null ? (
                    <Link href={`/adminvita/testing/bugs/${p.bug_id}`} className="text-xs font-bold text-teal-deep underline">
                      Ver bug
                    </Link>
                  ) : p.estado === "Falla" ? (
                    <BotonAccion accion={crearBugDesdePruebaAction.bind(null, p.id)} texto="Crear bug" tono="primario" irA="/adminvita/testing/bugs/" />
                  ) : null}
                </div>
                {p.resultado ? <p className="mt-2 whitespace-pre-line text-sm">{p.resultado}</p> : null}
                <div className="mt-3">
                  <Adjuntos tipo="prueba" id={p.id} adjuntos={d.adjuntos[p.id] ?? []} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Seccion>

      {d.bugs.length > 0 ? (
        <Seccion titulo="Bugs de este caso">
          <ul className={`${TARJETA} space-y-2 text-sm`}>
            {d.bugs.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-2">
                <Link href={`/adminvita/testing/bugs/${b.id}`} className="font-mono font-bold underline-offset-2 hover:underline">
                  {b.codigo}
                </Link>
                <span>{b.titulo}</span>
                <EtiquetaEstado valor={b.estado} />
                <EtiquetaEstado valor={b.severidad} />
              </li>
            ))}
          </ul>
        </Seccion>
      ) : null}
    </>
  );
}
