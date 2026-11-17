import Link from "next/link";
import { entrarAlPanel } from "@/lib/admin/datos";
import { leerBug, listarPersonas } from "@/lib/admin/testing/datos";
import { entero } from "@/lib/admin/testing/logica";
import { formatoFechaHoraAR } from "@/lib/admin/formato";
import { Seccion } from "../../../_componentes/ui";
import { Adjuntos } from "../../_componentes/adjuntos";
import { FormularioBug, FormularioComentario } from "../../_componentes/campos-formularios";
import { ErrorTesting, EtiquetaEstado, NoEncontrado, TARJETA } from "../../_componentes/comunes";
import { BotonAccion } from "../../_componentes/formularios";
import { borrarComentarioAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function BugPage({ params }: PageProps<"/adminvita/testing/bugs/[id]">) {
  const admin = await entrarAlPanel("/adminvita/testing/bugs/[id]");
  const id = entero((await params).id);
  if (id === null) return <NoEncontrado que="El bug" />;
  const [d, personas] = await Promise.all([leerBug(admin, id), listarPersonas(admin)]);
  if (d === null) return <ErrorTesting />;
  if (d === "no_existe") return <NoEncontrado que="El bug" />;
  const { bug } = d;

  return (
    <>
      <p className="mb-3 px-1 text-sm">
        <Link href="/adminvita/testing/bugs" className="font-semibold text-teal-deep underline-offset-2 hover:underline">
          ← Bugs
        </Link>
      </p>
      <div className={`${TARJETA} space-y-2`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-lg font-extrabold">{bug.codigo}</span>
          <EtiquetaEstado valor={bug.estado} />
          <EtiquetaEstado valor={bug.severidad} />
          {bug.ticket_externo ? <span className="rounded-full bg-panel-track px-2.5 py-0.5 font-mono text-xs font-bold">Ticket {bug.ticket_externo}</span> : null}
        </div>
        <p className="text-xs text-subtle">
          Creado por {bug.creado_por} el {formatoFechaHoraAR(bug.created_at)}
          {d.caso ? (
            <>
              {" · caso "}
              <Link href={`/adminvita/testing/casos/${d.caso.id}`} className="font-bold text-teal-deep underline">
                {d.caso.codigo}
              </Link>
            </>
          ) : null}
        </p>
        {d.reportes.length > 0 ? (
          <p className="text-xs text-subtle">
            Reportes:{" "}
            {d.reportes.map((r) => (
              <Link key={r.id} href={`/adminvita/testing/reportes/${r.id}`} className="mr-2 font-bold text-teal-deep underline">
                {r.codigo}
              </Link>
            ))}
          </p>
        ) : null}
        {bug.enlace ? (
          <p className="text-xs">
            <a href={bug.enlace} target="_blank" rel="noopener noreferrer" className="font-bold text-teal-deep underline">
              Link de la captura o video
            </a>
          </p>
        ) : null}
      </div>

      <Seccion titulo="Detalle">
        <FormularioBug personas={personas} bug={bug} />
      </Seccion>

      <Seccion titulo="Capturas y videos">
        <div className={TARJETA}>
          <Adjuntos tipo="bug" id={bug.id} adjuntos={d.adjuntos} />
        </div>
      </Seccion>

      <Seccion titulo="Historial">
        <div className={`${TARJETA} space-y-4`}>
          <ol className="space-y-3">
            {d.eventos.map((e) => (
              <li key={e.id} className="border-l-2 border-line pl-3 text-sm">
                <p className="text-xs text-subtle">
                  {formatoFechaHoraAR(e.created_at)} · {e.actor_email}
                </p>
                {e.accion === "creado" ? (
                  <p>
                    <strong>Bug creado.</strong> {e.cuerpo}
                  </p>
                ) : e.accion === "cambio" ? (
                  <p>
                    <strong>{e.campo}:</strong> {e.valor_anterior ?? "—"} → {e.valor_nuevo ?? "—"}
                  </p>
                ) : (
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="whitespace-pre-line">{e.cuerpo}</p>
                    {e.actor_email === admin.email ? <BotonAccion accion={borrarComentarioAction.bind(null, e.id)} texto="Borrar" confirmar="¿Borrar comentario?" tono="peligro" /> : null}
                  </div>
                )}
              </li>
            ))}
          </ol>
          <FormularioComentario bugId={bug.id} />
        </div>
      </Seccion>
    </>
  );
}
