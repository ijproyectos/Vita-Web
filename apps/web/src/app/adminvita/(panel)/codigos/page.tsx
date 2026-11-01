import { entrarAlPanel } from "@/lib/admin/datos";
import { listarCodigos } from "@/lib/admin/codigos";
import { formatoFechaAR, formatoFechaHoraAR } from "@/lib/admin/formato";
import { ETIQUETA_TIPO_CODIGO, type EstadoCodigo } from "@/lib/vita-plus/codigos";
import { Etiqueta, Seccion, TD, TH, Tabla, Vacio } from "../_componentes/ui";
import { BotonRevocar } from "./boton-revocar";
import { FormularioCodigos } from "./formulario";

export const dynamic = "force-dynamic";

const TONO: Record<EstadoCodigo, "ok" | "aviso" | "alerta" | "neutro"> = {
  activo: "ok",
  agotado: "neutro",
  vencido: "aviso",
  revocado: "alerta",
};

export default async function CodigosPage() {
  const admin = await entrarAlPanel("/adminvita/codigos");
  const codigos = await listarCodigos(admin);

  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight text-ink">Códigos de vita+</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-brand">
        Un código <strong>vita plus</strong> da vita+ por 15 días; uno <strong>vita admin</strong> lo da sin vencimiento. Cada cuenta
        puede canjear un código una sola vez. El código completo se muestra una sola vez al crearlo; después solo se ven los últimos 4
        caracteres. Revocar un código impide nuevos canjes, no le quita vita+ a quien ya lo canjeó.
      </p>

      <Seccion titulo="Generar">
        <FormularioCodigos />
      </Seccion>

      <Seccion titulo="Códigos creados">
        {codigos === null ? (
          <p className="rounded-[var(--radius-item)] border border-destructive/40 bg-destructive/10 p-4 text-sm font-semibold text-destructive">
            No se pudieron leer los códigos. Revisá que la migración 046 esté aplicada y volvé a intentar.
          </p>
        ) : codigos.length === 0 ? (
          <Vacio>Todavía no hay códigos.</Vacio>
        ) : (
          <Tabla>
            <thead>
              <tr>
                <th className={TH}>Código</th>
                <th className={TH}>Tipo</th>
                <th className={TH}>Usos</th>
                <th className={TH}>Estado</th>
                <th className={TH}>Vence el</th>
                <th className={TH}>Creado por</th>
                <th className={TH}>Fecha</th>
                <th className={TH}></th>
              </tr>
            </thead>
            <tbody>
              {codigos.map((c) => (
                <tr key={c.id}>
                  <td className={`${TD} font-mono font-bold`}>VITA-····-{c.ultimos4}</td>
                  <td className={TD}>{ETIQUETA_TIPO_CODIGO[c.tipo]}</td>
                  <td className={TD}>
                    {c.usos} / {c.usosMax}
                  </td>
                  <td className={TD}>
                    <Etiqueta tono={TONO[c.estado]}>{c.estado}</Etiqueta>
                  </td>
                  <td className={TD}>{c.venceCodigoAt ? formatoFechaAR(c.venceCodigoAt) : "—"}</td>
                  <td className={TD}>
                    <span className="block max-w-[200px] truncate text-xs">{c.creadoPor}</span>
                  </td>
                  <td className={TD}>{formatoFechaHoraAR(c.creado)}</td>
                  <td className={TD}>{c.estado === "revocado" ? null : <BotonRevocar id={c.id} ultimos4={c.ultimos4} />}</td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </Seccion>
    </>
  );
}
