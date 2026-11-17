import Link from "next/link";
import { entrarAlPanel } from "@/lib/admin/datos";
import { cargarTesting } from "@/lib/admin/testing/datos";
import { AREAS, ESTADOS_CASO, estadoDeCaso, filtrarCasos, ultimaPruebaPorCaso, type EstadoCaso } from "@/lib/admin/testing/logica";
import { PillFiltro, TD, TH, Tabla, Vacio } from "../../_componentes/ui";
import { ErrorTesting, EtiquetaEstado } from "../_componentes/comunes";

export const dynamic = "force-dynamic";

function primero(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

function href(area: string, estado: string, q: string): string {
  const p = new URLSearchParams();
  if (area) p.set("area", area);
  if (estado) p.set("estado", estado);
  if (q) p.set("q", q);
  const s = p.toString();
  return s ? `/adminvita/testing/casos?${s}` : "/adminvita/testing/casos";
}

export default async function CasosPage({ searchParams }: PageProps<"/adminvita/testing/casos">) {
  const admin = await entrarAlPanel("/adminvita/testing/casos");
  const sp = await searchParams;
  const datos = await cargarTesting(admin);
  if (!datos) return <ErrorTesting />;

  const areasConCasos = [...new Set(datos.casos.filter((c) => !c.archivado).map((c) => c.area))].sort(
    (a, b) => (AREAS.indexOf(a) === -1 ? 99 : AREAS.indexOf(a)) - (AREAS.indexOf(b) === -1 ? 99 : AREAS.indexOf(b)),
  );
  const areaCruda = primero(sp.area);
  const area = areasConCasos.includes(areaCruda) ? areaCruda : "";
  const estadoCrudo = primero(sp.estado);
  const estado = (ESTADOS_CASO as readonly string[]).includes(estadoCrudo) ? (estadoCrudo as EstadoCaso) : "";
  const q = primero(sp.q).trim().slice(0, 100);

  const ultima = ultimaPruebaPorCaso(datos.pruebas);
  const casos = filtrarCasos(datos.casos, ultima, { area, estado, q });

  return (
    <>
      <form action="/adminvita/testing/casos" className="flex flex-wrap gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Buscar por código, función o pasos"
          className="min-w-0 flex-1 rounded-full bg-card px-5 py-3 text-sm shadow-panel placeholder:text-subtle focus-visible:outline-2 focus-visible:outline-teal"
        />
        {area ? <input type="hidden" name="area" value={area} /> : null}
        {estado ? <input type="hidden" name="estado" value={estado} /> : null}
        <button type="submit" className="rounded-full bg-teal px-6 py-3 text-sm font-bold text-on-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal">
          Buscar
        </button>
      </form>

      <nav className="mt-3 flex flex-wrap gap-1.5" aria-label="Filtrar por área">
        <PillFiltro href={href("", estado, q)} activo={area === ""}>
          Todas las áreas
        </PillFiltro>
        {areasConCasos.map((a) => (
          <PillFiltro key={a} href={href(a, estado, q)} activo={a === area}>
            {a}
          </PillFiltro>
        ))}
      </nav>
      <nav className="mt-2 flex flex-wrap gap-1.5" aria-label="Filtrar por estado">
        <PillFiltro href={href(area, "", q)} activo={estado === ""}>
          Todos los estados
        </PillFiltro>
        {ESTADOS_CASO.map((e) => (
          <PillFiltro key={e} href={href(area, e, q)} activo={e === estado}>
            {e}
          </PillFiltro>
        ))}
      </nav>

      <p className="mt-4 text-sm text-subtle">{casos.length} casos</p>
      <div className="mt-2">
        {casos.length === 0 ? (
          <Vacio>No hay casos con ese filtro.</Vacio>
        ) : (
          <Tabla>
            <thead>
              <tr>
                <th className={TH}>Código</th>
                <th className={TH}>Área</th>
                <th className={TH}>Función</th>
                <th className={TH}>Prioridad</th>
                <th className={TH}>Estado</th>
                <th className={TH}>Última prueba</th>
              </tr>
            </thead>
            <tbody>
              {casos.map((c) => {
                const u = ultima.get(c.id);
                return (
                  <tr key={c.id}>
                    <td className={`${TD} font-mono font-bold`}>
                      <Link href={`/adminvita/testing/casos/${c.id}`} className="underline-offset-2 hover:underline">
                        {c.codigo}
                      </Link>
                    </td>
                    <td className={TD}>{c.area}</td>
                    <td className={TD}>{c.funcionalidad}</td>
                    <td className={TD}>{c.prioridad}</td>
                    <td className={TD}>
                      <EtiquetaEstado valor={estadoDeCaso(u)} />
                    </td>
                    <td className={`${TD} text-xs text-subtle`}>{u ? `${u.admin_email} · ${u.fecha}` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </Tabla>
        )}
      </div>
    </>
  );
}
