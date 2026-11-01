import Link from "next/link";
import { entrarAlPanel, obtenerIA } from "@/lib/admin/datos";
import { formatoDiaCorto, formatoMs, formatoNumero, formatoPorcentaje, formatoUSD } from "@/lib/admin/formato";
import { BarrasDiarias, ErrorDatos, Kpi, Seccion, TD, TH, Tabla, Vacio } from "../_componentes/ui";

export const dynamic = "force-dynamic";

const RANGOS = [7, 30, 90] as const;

export default async function IAPage({ searchParams }: PageProps<"/adminvita/ia">) {
  await entrarAlPanel("/adminvita/ia");
  const sp = await searchParams;
  const crudo = Number.parseInt((Array.isArray(sp.dias) ? sp.dias[0] : sp.dias) ?? "", 10);
  const dias = (RANGOS as readonly number[]).includes(crudo) ? crudo : 30;

  const ia = await obtenerIA(dias);
  if (!ia) return <ErrorDatos />;

  const costoTotal = ia.diario.reduce((a, x) => a + x.costoUsd, 0);
  const mensajes = ia.diario.reduce((a, x) => a + x.mensajes, 0);
  const cacheLect = ia.diario.reduce((a, x) => a + x.cacheLectura, 0);
  const entrada = ia.diario.reduce((a, x) => a + x.tokensInput, 0);
  const ratioPeriodo = entrada + cacheLect > 0 ? (100 * cacheLect) / (entrada + cacheLect) : null;
  const erroresTotal = ia.errores.reduce((a, x) => a + x.n, 0);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">IA y costos</h1>
        <nav className="flex gap-1.5" aria-label="Período">
          {RANGOS.map((r) => (
            <Link
              key={r}
              href={`/adminvita/ia?dias=${r}`}
              aria-current={r === dias ? "page" : undefined}
              className={`rounded-full border px-3 py-1 text-xs font-bold ${
                r === dias ? "border-teal bg-mint text-teal-deep" : "border-line bg-paper text-slate-brand"
              }`}
            >
              {r} días
            </Link>
          ))}
        </nav>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi titulo={`Costo (${dias} días)`} valor={formatoUSD(costoTotal)} detalle={`${formatoUSD(costoTotal / dias)} por día`} />
        <Kpi titulo="Respuestas de vita" valor={formatoNumero(mensajes)} />
        <Kpi titulo="Lectura de caché" valor={formatoPorcentaje(ratioPeriodo)} detalle="de los tokens de entrada" />
        <Kpi titulo="Respuestas con problema" valor={formatoNumero(erroresTotal)} tono={erroresTotal > 0 ? "alerta" : "neutro"} />
      </div>

      <Seccion titulo="Por día">
        <div className="grid gap-3 lg:grid-cols-2">
          <BarrasDiarias
            titulo="Costo diario (USD)"
            barras={[...ia.diario].reverse().map((x) => ({ etiqueta: formatoDiaCorto(x.fecha), valor: x.costoUsd, detalle: formatoUSD(x.costoUsd) }))}
          />
          <BarrasDiarias
            titulo="Respuestas de vita por día"
            barras={[...ia.diario].reverse().map((x) => ({ etiqueta: formatoDiaCorto(x.fecha), valor: x.mensajes, detalle: formatoNumero(x.mensajes) }))}
          />
        </div>
      </Seccion>

      <Seccion titulo="Latencia de respuestas correctas">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi titulo="p50 respuesta" valor={formatoMs(ia.latencia.p50)} />
          <Kpi titulo="p95 respuesta" valor={formatoMs(ia.latencia.p95)} />
          <Kpi titulo="p50 primer token" valor={formatoMs(ia.latencia.p50PrimerToken)} />
          <Kpi titulo="p95 primer token" valor={formatoMs(ia.latencia.p95PrimerToken)} />
        </div>
      </Seccion>

      <Seccion titulo="Quién más gasta">
        {ia.top.length === 0 ? (
          <Vacio>Sin uso de IA en el período.</Vacio>
        ) : (
          <Tabla>
            <thead>
              <tr>
                <th className={TH}>Cuenta</th>
                <th className={TH}>Costo</th>
                <th className={TH}>Tokens</th>
                <th className={TH}>Llamadas</th>
              </tr>
            </thead>
            <tbody>
              {ia.top.map((u) => (
                <tr key={u.id}>
                  <td className={TD}>
                    <Link href={`/adminvita/usuarios/${u.id}`} className="font-bold text-teal-deep hover:underline">
                      {u.nombre || u.email || u.id.slice(0, 8)}
                    </Link>
                    <div className="text-xs text-subtle">{u.email}</div>
                  </td>
                  <td className={TD}>{formatoUSD(u.costoUsd)}</td>
                  <td className={TD}>{formatoNumero(u.tokens)}</td>
                  <td className={TD}>{formatoNumero(u.llamadas)}</td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </Seccion>

      <Seccion titulo="Errores del chat">
        {ia.errores.length === 0 ? (
          <Vacio>Sin errores registrados en el período.</Vacio>
        ) : (
          <Tabla>
            <thead>
              <tr>
                <th className={TH}>Resultado</th>
                <th className={TH}>Código</th>
                <th className={TH}>Cantidad</th>
              </tr>
            </thead>
            <tbody>
              {ia.errores.map((e) => (
                <tr key={`${e.resultado}-${e.codigo}`}>
                  <td className={TD}>{e.resultado}</td>
                  <td className={TD}>{e.codigo ?? "—"}</td>
                  <td className={TD}>{formatoNumero(e.n)}</td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </Seccion>
    </>
  );
}
