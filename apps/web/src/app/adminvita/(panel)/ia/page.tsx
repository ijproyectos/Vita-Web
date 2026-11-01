import Link from "next/link";
import { entrarAlPanel, obtenerIA } from "@/lib/admin/datos";
import { formatoDiaCorto, formatoMs, formatoNumero, formatoPorcentaje, formatoUSD } from "@/lib/admin/formato";
import { AreaSuave, Avatar, BarrasDiarias, Encabezado, ErrorDatos, Hero, Kpi, Seccion, TD, TH, Tabla, Toggle, Vacio } from "../_componentes/ui";

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
      <Encabezado
        titulo="IA y costos"
        derecha={<Toggle etiqueta="Período" opciones={RANGOS.map((r) => ({ href: `/adminvita/ia?dias=${r}`, texto: `${r} días`, activo: r === dias }))} />}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Hero titulo={`Costo (${dias} días)`} subtitulo="Gasto de IA del período" valor={formatoUSD(costoTotal)} detalle={`${formatoUSD(costoTotal / dias)} por día`} />
        <Kpi titulo="Respuestas de vita" valor={formatoNumero(mensajes)} />
        <Kpi titulo="Lectura de caché" valor={formatoPorcentaje(ratioPeriodo)} detalle="de los tokens de entrada" />
        <Kpi titulo="Respuestas con problema" valor={formatoNumero(erroresTotal)} tono={erroresTotal > 0 ? "alerta" : "neutro"} />
      </div>

      <Seccion titulo="Por día">
        <div className="grid gap-4 lg:grid-cols-2">
          <BarrasDiarias
            titulo="Costo diario (USD)"
            subtitulo={`Últimos ${dias} días`}
            barras={[...ia.diario].reverse().map((x) => ({ etiqueta: formatoDiaCorto(x.fecha), valor: x.costoUsd, detalle: formatoUSD(x.costoUsd) }))}
          />
          <AreaSuave
            titulo="Respuestas de vita por día"
            subtitulo={`Últimos ${dias} días`}
            puntos={[...ia.diario].reverse().map((x) => ({ etiqueta: formatoDiaCorto(x.fecha), valor: x.mensajes, detalle: formatoNumero(x.mensajes) }))}
          />
        </div>
      </Seccion>

      <Seccion titulo="Latencia de respuestas correctas">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
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
                    <div className="flex items-center gap-3">
                      <Avatar nombre={u.nombre || u.email || "?"} />
                      <div className="min-w-0">
                        <Link href={`/adminvita/usuarios/${u.id}`} className="font-bold text-ink hover:underline">
                          {u.nombre || u.email || u.id.slice(0, 8)}
                        </Link>
                        <div className="truncate text-xs text-subtle">{u.email}</div>
                      </div>
                    </div>
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
