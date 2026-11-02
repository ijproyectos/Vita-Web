import { requireAdmin } from "@/lib/admin/acceso";
import { entrarAlPanel } from "@/lib/admin/datos";
import { leerPanelEnvios } from "@/lib/admin/envios-masivos";
import { porcentajeEnvio, type EstadoEnvio } from "@/lib/admin/envios-masivos-logica";
import { formatoFechaHoraAR, formatoNumero } from "@/lib/admin/formato";
import { Encabezado, Etiqueta, Kpi, Seccion, TD, TH, Tabla, Vacio } from "../_componentes/ui";
import { BotonCancelarEnvio } from "./boton-cancelar";
import { FormularioEnvioMasivo } from "./formulario";

export const dynamic = "force-dynamic";

const TONO: Record<EstadoEnvio, "ok" | "aviso" | "alerta" | "neutro"> = {
  pendiente: "aviso",
  enviando: "aviso",
  terminado: "ok",
  cancelado: "neutro",
};

const ETIQUETA: Record<EstadoEnvio, string> = {
  pendiente: "En cola",
  enviando: "Enviando",
  terminado: "Terminado",
  cancelado: "Cancelado",
};

export default async function NotificacionesPage() {
  await entrarAlPanel("/adminvita/notificaciones");
  const admin = await requireAdmin();
  const { destinatarios, envios } = await leerPanelEnvios(admin);

  return (
    <>
      <Encabezado titulo="Notificaciones" />
      <p className="-mt-2 mb-2 max-w-2xl px-1 text-sm text-slate-brand">
        Un anuncio a todas las personas con notificaciones activadas. Para escribirle a una sola persona, usá la ficha del usuario. El
        envío sale en lotes desde la tarea programada, así que puede tardar unos minutos en completarse.
      </p>

      <Seccion titulo="Nuevo envío">
        {destinatarios === null ? (
          <p className="rounded-[28px] bg-destructive/10 p-5 text-sm font-semibold text-destructive">
            No se pudo contar a los destinatarios. Revisá que la migración 047 esté aplicada y volvé a intentar.
          </p>
        ) : (
          <>
            <div className="mb-3 grid grid-cols-2 gap-3 sm:max-w-md">
              <Kpi titulo="Personas" valor={formatoNumero(destinatarios.usuarios)} />
              <Kpi titulo="Dispositivos" valor={formatoNumero(destinatarios.dispositivos)} />
            </div>
            <FormularioEnvioMasivo usuarios={destinatarios.usuarios} dispositivos={destinatarios.dispositivos} />
          </>
        )}
      </Seccion>

      <Seccion titulo="Historial">
        {envios === null ? (
          <p className="rounded-[28px] bg-destructive/10 p-5 text-sm font-semibold text-destructive">No se pudo leer el historial.</p>
        ) : envios.length === 0 ? (
          <Vacio>Todavía no hubo envíos masivos.</Vacio>
        ) : (
          <Tabla>
            <thead>
              <tr>
                <th className={TH}>Título</th>
                <th className={TH}>Estado</th>
                <th className={TH}>Progreso</th>
                <th className={TH}>Entregas</th>
                <th className={TH}>Creado por</th>
                <th className={TH}>Fecha</th>
                <th className={TH}></th>
              </tr>
            </thead>
            <tbody>
              {envios.map((e) => {
                const pct = porcentajeEnvio(e);
                return (
                  <tr key={e.id}>
                    <td className={TD}>
                      <span className="block max-w-[220px] truncate font-bold">{e.titulo}</span>
                    </td>
                    <td className={TD}>
                      <Etiqueta tono={TONO[e.estado]}>{ETIQUETA[e.estado]}</Etiqueta>
                    </td>
                    <td className={TD}>
                      <div className="flex items-center gap-2">
                        <div
                          role="progressbar"
                          aria-label={`Progreso de ${e.titulo}`}
                          aria-valuenow={pct}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          className="h-2 w-24 overflow-hidden rounded-full bg-panel-track"
                        >
                          <div className="h-full rounded-full bg-teal" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-slate-brand">
                          {formatoNumero(e.usuariosProcesados)} / {formatoNumero(e.totalUsuarios)}
                        </span>
                      </div>
                    </td>
                    <td className={TD}>
                      <span className="text-xs text-slate-brand">
                        {formatoNumero(e.enviados)} enviadas · {formatoNumero(e.fallidos)} fallidas
                      </span>
                    </td>
                    <td className={TD}>
                      <span className="block max-w-[200px] truncate text-xs">{e.creadoPor}</span>
                    </td>
                    <td className={TD}>{formatoFechaHoraAR(e.creado)}</td>
                    <td className={TD}>{e.estado === "pendiente" || e.estado === "enviando" ? <BotonCancelarEnvio id={e.id} titulo={e.titulo} /> : null}</td>
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
