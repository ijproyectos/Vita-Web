import Link from "next/link";
import { entrarAlPanel } from "@/lib/admin/datos";
import { cargarTesting } from "@/lib/admin/testing/datos";
import { SEVERIDADES, resumir } from "@/lib/admin/testing/logica";
import { formatoPorcentaje } from "@/lib/admin/formato";
import { Kpi, Seccion } from "../_componentes/ui";
import { BarraAvance, ErrorTesting, TARJETA, textoConteo } from "./_componentes/comunes";

export const dynamic = "force-dynamic";

export default async function TestingResumenPage() {
  const admin = await entrarAlPanel("/adminvita/testing");
  const datos = await cargarTesting(admin);
  if (!datos) return <ErrorTesting />;
  const r = resumir(datos.casos, datos.pruebas, datos.bugs, datos.reportes);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi titulo="Casos probados" valor={`${Math.round(r.avance * 100)}%`} detalle={`${r.total - r.conteo.Pendiente} de ${r.total}`} href="/adminvita/testing/casos" />
        <Kpi titulo="Pasan (de lo probado)" valor={formatoPorcentaje(r.tasaOk)} detalle={`${r.conteo.OK} OK · ${r.conteo.Falla} falla`} tono={r.conteo.Falla > 0 ? "alerta" : "ok"} />
        <Kpi
          titulo="Bugs abiertos"
          valor={String(r.bugsAbiertos)}
          detalle={SEVERIDADES.map((s) => `${r.bugsPorSeveridad[s]} ${s.toLowerCase()}`).join(" · ")}
          tono={r.bugsAbiertos > 0 ? "alerta" : "neutro"}
          href="/adminvita/testing/bugs"
        />
        <Kpi titulo="Reportes sin resolver" valor={String(r.reportesPendientes)} href="/adminvita/testing/reportes" />
      </div>

      <Seccion titulo="Avance por área">
        <div className={`${TARJETA} space-y-4`}>
          {r.porArea.length === 0 ? (
            <p className="text-sm text-subtle">Todavía no hay casos. Cargá el seed (supabase/seeds/track_casos.sql).</p>
          ) : (
            r.porArea.map((a) => (
              <div key={a.area}>
                <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <Link href={`/adminvita/testing/casos?area=${encodeURIComponent(a.area)}`} className="font-bold text-ink underline-offset-2 hover:underline">
                    {a.area}
                  </Link>
                  <span className="text-xs text-subtle">
                    {a.total} casos · {textoConteo(a.conteo)} · pasa {formatoPorcentaje(a.tasaOk)}
                  </span>
                </div>
                <BarraAvance conteo={a.conteo} total={a.total} />
              </div>
            ))
          )}
        </div>
      </Seccion>
    </>
  );
}
