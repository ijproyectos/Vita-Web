import { APP_VERSION, TEXTO_BUILD } from "@/lib/version";
import { entrarAlPanel, obtenerSistema, obtenerVitals } from "@/lib/admin/datos";
import { formatoBytes, formatoFechaHoraAR, formatoNumero } from "@/lib/admin/formato";
import { Encabezado, ErrorDatos, Etiqueta, Kpi, Seccion, TD, TH, Tabla, Vacio } from "../_componentes/ui";

export const dynamic = "force-dynamic";

// CLS no tiene unidad; el resto son milisegundos (se muestran en segundos desde 1000 ms).
function textoMetrica(metrica: string, valor: number): string {
  if (metrica === "CLS") return valor.toFixed(3).replace(".", ",");
  return valor >= 1000 ? `${(valor / 1000).toFixed(1).replace(".", ",")} s` : `${Math.round(valor)} ms`;
}

export default async function SistemaPage() {
  await entrarAlPanel("/adminvita/sistema");
  const [s, vitals] = await Promise.all([obtenerSistema(), obtenerVitals(7)]);
  if (!s) return <ErrorDatos />;
  const storageBytes = s.storage.reduce((a, x) => a + x.bytes, 0);
  const storageObjetos = s.storage.reduce((a, x) => a + x.objetos, 0);

  return (
    <>
      <Encabezado titulo="Sistema" />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi titulo="Versión desplegada" valor={APP_VERSION} detalle={TEXTO_BUILD} />
        <Kpi titulo="Base de datos" valor={formatoBytes(s.dbBytes)} />
        <Kpi titulo="Última migración" valor={s.migracion ?? "—"} />
        <Kpi titulo="Storage" valor={formatoBytes(storageBytes)} detalle={`${formatoNumero(storageObjetos)} archivos`} />
        <Kpi titulo="Push" valor={formatoNumero(s.push.suscripciones)} detalle={`dispositivos de ${formatoNumero(s.push.usuarios)} cuentas`} />
      </div>

      <Seccion titulo="Velocidad real (últimos 7 días)">
        {!vitals || vitals.metricas.length === 0 ? (
          <Vacio>Todavía no hay mediciones (o falta aplicar la migración 050).</Vacio>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
              {vitals.metricas.map((m) => (
                <Kpi
                  key={m.metrica}
                  titulo={`${m.metrica} p75`}
                  valor={textoMetrica(m.metrica, m.p75)}
                  detalle={`${formatoNumero(m.n)} mediciones${m.buenosPct === null ? "" : ` · ${Math.round(m.buenosPct)}% buenas`}`}
                />
              ))}
            </div>
            {vitals.rutasLentas.length > 0 ? (
              <Tabla>
                <thead>
                  <tr>
                    <th className={TH}>Ruta más lenta (LCP p75)</th>
                    <th className={TH}>LCP p75</th>
                    <th className={TH}>Mediciones</th>
                  </tr>
                </thead>
                <tbody>
                  {vitals.rutasLentas.map((r) => (
                    <tr key={r.ruta}>
                      <td className={TD}>
                        <code className="text-xs">{r.ruta}</code>
                      </td>
                      <td className={TD}>{textoMetrica("LCP", r.p75Lcp)}</td>
                      <td className={TD}>{formatoNumero(r.n)}</td>
                    </tr>
                  ))}
                </tbody>
              </Tabla>
            ) : null}
          </div>
        )}
      </Seccion>

      <Seccion titulo="Jobs de cron">
        {s.cron.length === 0 ? (
          <Vacio>No hay jobs programados (o pg_cron no está instalado).</Vacio>
        ) : (
          <Tabla>
            <thead>
              <tr>
                <th className={TH}>Job</th>
                <th className={TH}>Frecuencia</th>
                <th className={TH}>Activo</th>
                <th className={TH}>Última corrida</th>
                <th className={TH}>24 h</th>
              </tr>
            </thead>
            <tbody>
              {s.cron.map((j) => (
                <tr key={j.nombre}>
                  <td className={TD}>{j.nombre}</td>
                  <td className={TD}>
                    <code className="text-xs">{j.schedule}</code>
                  </td>
                  <td className={TD}>{j.activo ? <Etiqueta tono="ok">Sí</Etiqueta> : <Etiqueta tono="alerta">No</Etiqueta>}</td>
                  <td className={TD}>
                    {j.ultimoEstado ? <Etiqueta tono={j.ultimoEstado === "succeeded" ? "ok" : j.ultimoEstado === "failed" ? "alerta" : "neutro"}>{j.ultimoEstado}</Etiqueta> : "—"}
                    <div className="text-xs text-subtle">{formatoFechaHoraAR(j.ultimaCorrida)}</div>
                  </td>
                  <td className={TD}>
                    {formatoNumero(j.corridas24h)} corridas
                    {j.fallos24h > 0 ? <span className="ml-1 font-bold text-destructive">· {formatoNumero(j.fallos24h)} fallos</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </Seccion>

      <Seccion titulo="Llamadas HTTP del cron (24 h)">
        {s.http.length === 0 ? (
          <Vacio>Sin llamadas registradas.</Vacio>
        ) : (
          <div className="flex flex-wrap gap-2">
            {s.http.map((h) => (
              <Etiqueta key={h.codigo} tono={h.codigo.startsWith("2") ? "ok" : "alerta"}>
                {h.codigo} · {formatoNumero(h.n)}
              </Etiqueta>
            ))}
          </div>
        )}
      </Seccion>

      <Seccion titulo="Tablas más grandes">
        <Tabla>
          <thead>
            <tr>
              <th className={TH}>Tabla</th>
              <th className={TH}>Tamaño</th>
              <th className={TH}>Filas (estimado)</th>
            </tr>
          </thead>
          <tbody>
            {s.tablas.map((t) => (
              <tr key={t.nombre}>
                <td className={TD}>{t.nombre}</td>
                <td className={TD}>{formatoBytes(t.bytes)}</td>
                <td className={TD}>{formatoNumero(t.filas)}</td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      </Seccion>

      {s.storage.length > 0 ? (
        <Seccion titulo="Storage por bucket">
          <Tabla>
            <thead>
              <tr>
                <th className={TH}>Bucket</th>
                <th className={TH}>Archivos</th>
                <th className={TH}>Tamaño</th>
              </tr>
            </thead>
            <tbody>
              {s.storage.map((b) => (
                <tr key={b.bucket}>
                  <td className={TD}>{b.bucket}</td>
                  <td className={TD}>{formatoNumero(b.objetos)}</td>
                  <td className={TD}>{formatoBytes(b.bytes)}</td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        </Seccion>
      ) : null}
    </>
  );
}
