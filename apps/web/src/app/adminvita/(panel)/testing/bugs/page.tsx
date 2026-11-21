import Link from "next/link";
import { entrarAlPanel } from "@/lib/admin/datos";
import { cargarTesting, listarPersonas } from "@/lib/admin/testing/datos";
import { ESTADOS_BUG, SEVERIDADES, filtrarBugs, ordenarBugs, type EstadoBug, type Severidad } from "@/lib/admin/testing/logica";
import { PillFiltro, Seccion, TD, TH, Tabla, Vacio } from "../../_componentes/ui";
import { FormularioBug } from "../_componentes/campos-formularios";
import { ErrorTesting, EtiquetaEstado } from "../_componentes/comunes";

export const dynamic = "force-dynamic";

function primero(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

function href(estado: string, severidad: string): string {
  const p = new URLSearchParams();
  if (estado) p.set("estado", estado);
  if (severidad) p.set("severidad", severidad);
  const s = p.toString();
  return s ? `/adminvita/testing/bugs?${s}` : "/adminvita/testing/bugs";
}

export default async function BugsPage({ searchParams }: PageProps<"/adminvita/testing/bugs">) {
  const admin = await entrarAlPanel("/adminvita/testing/bugs");
  const sp = await searchParams;
  const [datos, personas] = await Promise.all([cargarTesting(admin), listarPersonas(admin)]);
  if (!datos) return <ErrorTesting />;

  const e = primero(sp.estado);
  const estado = e === "abiertos" || (ESTADOS_BUG as readonly string[]).includes(e) ? (e as EstadoBug | "abiertos") : "";
  const s = primero(sp.severidad);
  const severidad = (SEVERIDADES as readonly string[]).includes(s) ? (s as Severidad) : "";
  const bugs = ordenarBugs(filtrarBugs(datos.bugs, { estado, severidad }));
  const casoPorId = new Map(datos.casos.map((c) => [c.id, c]));

  return (
    <>
      <nav className="flex flex-wrap gap-1.5" aria-label="Filtrar por estado">
        <PillFiltro href={href("", severidad)} activo={estado === ""}>
          Todos
        </PillFiltro>
        <PillFiltro href={href("abiertos", severidad)} activo={estado === "abiertos"}>
          Abiertos
        </PillFiltro>
        {ESTADOS_BUG.map((x) => (
          <PillFiltro key={x} href={href(x, severidad)} activo={estado === x}>
            {x}
          </PillFiltro>
        ))}
      </nav>
      <nav className="mt-2 flex flex-wrap gap-1.5" aria-label="Filtrar por severidad">
        <PillFiltro href={href(estado, "")} activo={severidad === ""}>
          Toda severidad
        </PillFiltro>
        {SEVERIDADES.map((x) => (
          <PillFiltro key={x} href={href(estado, x)} activo={severidad === x}>
            {x}
          </PillFiltro>
        ))}
      </nav>

      <div className="mt-4">
        {bugs.length === 0 ? (
          <Vacio>No hay bugs con ese filtro.</Vacio>
        ) : (
          <Tabla>
            <thead>
              <tr>
                <th className={TH}>Bug</th>
                <th className={TH}>Título</th>
                <th className={TH}>Severidad</th>
                <th className={TH}>Estado</th>
                <th className={TH}>Caso</th>
                <th className={TH}>Reportó</th>
                <th className={TH}>Lo arregla</th>
                <th className={TH}>Ticket</th>
              </tr>
            </thead>
            <tbody>
              {bugs.map((b) => (
                <tr key={b.id}>
                  <td className={`${TD} font-mono font-bold`}>
                    <Link href={`/adminvita/testing/bugs/${b.id}`} className="underline-offset-2 hover:underline">
                      {b.codigo}
                    </Link>
                  </td>
                  <td className={TD}>
                    <span className="block max-w-[320px] truncate">{b.titulo}</span>
                  </td>
                  <td className={TD}>
                    <EtiquetaEstado valor={b.severidad} />
                  </td>
                  <td className={TD}>
                    <EtiquetaEstado valor={b.estado} />
                  </td>
                  <td className={`${TD} text-xs`}>{b.caso_id !== null ? (casoPorId.get(b.caso_id)?.codigo ?? "—") : "—"}</td>
                  <td className={`${TD} text-xs`}>{b.reportado_por || "—"}</td>
                  <td className={`${TD} text-xs`}>{b.responsable_email ?? "—"}</td>
                  <td className={`${TD} font-mono text-xs`}>{b.ticket_externo || "—"}</td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </div>

      <Seccion titulo="Nuevo bug">
        <FormularioBug personas={personas} />
      </Seccion>
    </>
  );
}
