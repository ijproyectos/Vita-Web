import { entrarAlPanel } from "@/lib/admin/datos";
import { obtenerDatosChat, TOPE_FILAS_CHAT } from "@/lib/admin/chat";
import {
  desgloseErrores,
  periodoDe,
  PERIODOS_CHAT,
  porDia,
  porTramoDeContexto,
  porVersion,
  prefijoId,
  resumir,
  resumirValoraciones,
  topTools,
} from "@/lib/admin/chat-metricas";
import { formatoDiaCorto, formatoFechaHoraAR, formatoMs, formatoNumero, formatoPorcentaje } from "@/lib/admin/formato";
import { Encabezado, ErrorDatos, Kpi, Seccion, TD, TH, Tabla, Toggle, Vacio } from "../_componentes/ui";

export const dynamic = "force-dynamic";

const pct = (r: number | null) => (r === null ? "—" : formatoPorcentaje(r * 100));
const tokens = (n: number | null) => (n === null ? "—" : formatoNumero(n));
const usd = (n: number | null) => (n === null ? "—" : `US$ ${n.toLocaleString("es-AR", { minimumFractionDigits: 3, maximumFractionDigits: 4 })}`);

export default async function ChatAdminPage({ searchParams }: PageProps<"/adminvita/chat">) {
  await entrarAlPanel("/adminvita/chat");
  const sp = await searchParams;
  const periodo = periodoDe(Array.isArray(sp.periodo) ? sp.periodo[0] : sp.periodo);

  const datos = await obtenerDatosChat(periodo.horas);
  if (!datos) return <ErrorDatos />;

  const r = resumir(datos.filas);
  const dias = porDia(datos.filas);
  const tramos = porTramoDeContexto(datos.filas);
  const tools = topTools(datos.filas);
  const errores = desgloseErrores(datos.filas);
  const versiones = porVersion(datos.filas);
  const val = datos.valoraciones ? resumirValoraciones(datos.valoraciones) : null;

  return (
    <>
      <Encabezado
        titulo="Chat con vita"
        derecha={<Toggle etiqueta="Período" opciones={PERIODOS_CHAT.map((p) => ({ href: `/adminvita/chat?periodo=${p.clave}`, texto: p.texto, activo: p.clave === periodo.clave }))} />}
      />

      {datos.truncado && (
        <p role="status" className="rounded-[28px] bg-aviso-tint p-4 text-sm font-semibold text-aviso-ink">
          Muestra truncada: se leyeron las {formatoNumero(datos.filas.length)} respuestas más recientes de {formatoNumero(datos.total)} (tope {formatoNumero(TOPE_FILAS_CHAT)}). Elegí un período más corto para ver todo.
        </p>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi titulo="Respuestas" valor={formatoNumero(datos.total)} detalle={`en ${periodo.texto}`} />
        <Kpi titulo="Cortadas por tiempo" valor={pct(r.tasaCorte)} tono={r.tasaCorte !== null && r.tasaCorte > 0.05 ? "alerta" : "neutro"} detalle="error de tiempo" />
        <Kpi titulo="Latencia p50 / p90" valor={`${formatoMs(r.latenciaP50)} / ${formatoMs(r.latenciaP90)}`} />
        <Kpi titulo="Primer token p50 / p90" valor={`${formatoMs(r.primerTokenP50)} / ${formatoMs(r.primerTokenP90)}`} />
        <Kpi titulo="Contexto promedio" valor={tokens(r.contextoPromedio === null ? null : Math.round(r.contextoPromedio))} detalle="tokens por respuesta" />
        <Kpi titulo="Caché leída" valor={pct(r.ratioCache)} detalle="del contexto" />
        <Kpi titulo="Costo por respuesta" valor={usd(r.costoPromedioUsd)} detalle="promedio" />
        <Kpi
          titulo="Valoradas con 👍"
          valor={val === null ? "—" : pct(val.porcentajePositivas)}
          detalle={val === null ? "Sin datos de valoraciones" : `${formatoNumero(val.total)} valoradas · ${formatoNumero(val.negativas)} con 👎`}
        />
      </div>

      <Seccion titulo="Por día">
        {dias.length === 0 ? (
          <Vacio>Sin respuestas en el período.</Vacio>
        ) : (
          <Tabla>
            <thead>
              <tr>
                <th className={TH}>Día</th>
                <th className={TH}>Respuestas</th>
                <th className={TH}>Cortadas</th>
                <th className={TH}>Latencia p90</th>
                <th className={TH}>Contexto promedio</th>
              </tr>
            </thead>
            <tbody>
              {dias.map((d) => (
                <tr key={d.fecha}>
                  <td className={TD}>{formatoDiaCorto(d.fecha)}</td>
                  <td className={TD}>{formatoNumero(d.respuestas)}</td>
                  <td className={TD}>{formatoNumero(d.cortes)}</td>
                  <td className={TD}>{formatoMs(d.p90Ms)}</td>
                  <td className={TD}>{tokens(d.contextoPromedio === null ? null : Math.round(d.contextoPromedio))}</td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </Seccion>

      <Seccion titulo="Tamaño del contexto">
        <Tabla>
          <thead>
            <tr>
              <th className={TH}>Tramo (tokens)</th>
              <th className={TH}>Respuestas</th>
              <th className={TH}>Cortadas</th>
              <th className={TH}>Tasa de corte</th>
            </tr>
          </thead>
          <tbody>
            {tramos.map((t) => (
              <tr key={t.clave}>
                <td className={TD}>{t.texto}</td>
                <td className={TD}>{formatoNumero(t.respuestas)}</td>
                <td className={TD}>{formatoNumero(t.cortes)}</td>
                <td className={TD}>{pct(t.tasaCorte)}</td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      </Seccion>

      <div className="grid gap-6 lg:grid-cols-2">
        <Seccion titulo="Herramientas más usadas">
          {tools.length === 0 ? (
            <Vacio>Ninguna herramienta usada en el período.</Vacio>
          ) : (
            <Tabla>
              <thead>
                <tr>
                  <th className={TH}>Herramienta</th>
                  <th className={TH}>Respuestas</th>
                </tr>
              </thead>
              <tbody>
                {tools.map((t) => (
                  <tr key={t.nombre}>
                    <td className={TD}>{t.nombre}</td>
                    <td className={TD}>{formatoNumero(t.n)}</td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}
        </Seccion>

        <Seccion titulo="Códigos de error">
          {errores.length === 0 ? (
            <Vacio>Sin errores registrados en el período.</Vacio>
          ) : (
            <Tabla>
              <thead>
                <tr>
                  <th className={TH}>Código</th>
                  <th className={TH}>Cantidad</th>
                </tr>
              </thead>
              <tbody>
                {errores.map((e) => (
                  <tr key={e.nombre}>
                    <td className={TD}>{e.nombre}</td>
                    <td className={TD}>{formatoNumero(e.n)}</td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}
        </Seccion>
      </div>

      <Seccion titulo="Por versión del prompt">
        {versiones.length === 0 ? (
          <Vacio>Sin respuestas en el período.</Vacio>
        ) : (
          <Tabla>
            <thead>
              <tr>
                <th className={TH}>Versión</th>
                <th className={TH}>Respuestas</th>
                <th className={TH}>Cortadas</th>
                <th className={TH}>Latencia p50 / p90</th>
                <th className={TH}>Contexto promedio</th>
                <th className={TH}>Caché leída</th>
                <th className={TH}>Costo por respuesta</th>
              </tr>
            </thead>
            <tbody>
              {versiones.map((v) => (
                <tr key={v.version}>
                  <td className={TD}>{v.version}</td>
                  <td className={TD}>{formatoNumero(v.respuestas)}</td>
                  <td className={TD}>{pct(v.tasaCorte)}</td>
                  <td className={TD}>{`${formatoMs(v.latenciaP50)} / ${formatoMs(v.latenciaP90)}`}</td>
                  <td className={TD}>{tokens(v.contextoPromedio === null ? null : Math.round(v.contextoPromedio))}</td>
                  <td className={TD}>{pct(v.ratioCache)}</td>
                  <td className={TD}>{usd(v.costoPromedioUsd)}</td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </Seccion>

      <Seccion titulo="Últimos 👎">
        {datos.valoraciones === null ? (
          <Vacio>Las valoraciones todavía no están disponibles (falta aplicar la migración 060).</Vacio>
        ) : datos.negativas.length === 0 ? (
          <Vacio>Sin 👎 en el período.</Vacio>
        ) : (
          <Tabla>
            <thead>
              <tr>
                <th className={TH}>Fecha</th>
                <th className={TH}>Motivo</th>
                <th className={TH}>Cuenta</th>
              </tr>
            </thead>
            <tbody>
              {datos.negativas.map((n, i) => (
                <tr key={`${n.created_at}-${i}`}>
                  <td className={TD}>{formatoFechaHoraAR(n.created_at)}</td>
                  <td className={TD}>{n.motivo ?? "Sin motivo"}</td>
                  <td className={TD}>{prefijoId(n.usuario_id)}</td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}
        {datos.valoracionesTruncadas && <p className="mt-2 text-xs text-subtle">Muestra truncada: hay más valoraciones que el tope de {formatoNumero(TOPE_FILAS_CHAT)}.</p>}
      </Seccion>
    </>
  );
}
