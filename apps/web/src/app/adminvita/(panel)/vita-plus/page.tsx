import Link from "next/link";
import { entrarAlPanel, obtenerVitaPlus } from "@/lib/admin/datos";
import { formatoARS, formatoFechaHoraAR, formatoNumero } from "@/lib/admin/formato";
import { ErrorDatos, Kpi, Seccion, TD, TH, Tabla, Vacio } from "../_componentes/ui";

export const dynamic = "force-dynamic";

export default async function VitaPlusPage() {
  await entrarAlPanel("/adminvita/vita-plus");
  const v = await obtenerVitaPlus();
  if (!v) return <ErrorDatos />;

  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight text-ink">vita+</h1>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          titulo="Activos"
          valor={formatoNumero(v.activos)}
          tono="ok"
          detalle={`${formatoNumero(v.vencidos)} vencidos · ${formatoNumero(v.permanentes)} sin vencimiento`}
        />
        <Kpi titulo="Suscripciones" valor={formatoNumero(v.autorizadas)} detalle={`${formatoNumero(v.pausadas)} pausadas · ${formatoNumero(v.pendientes)} pendientes`} />
        <Kpi titulo="Canceladas" valor={formatoNumero(v.canceladas)} />
        <Kpi titulo="Activos por pago" valor={formatoNumero(v.activosPago)} />
        <Kpi titulo="Activos por código plus" valor={formatoNumero(v.activosCodigoPlus)} detalle="15 días" />
        <Kpi titulo="Activos por código admin" valor={formatoNumero(v.activosCodigoAdmin)} detalle="sin vencimiento" />
        <Kpi titulo="Ingresos (30 días)" valor={formatoARS(v.ingresosArs30d)} detalle={`${formatoNumero(v.pagos30d)} cobros · total ${formatoARS(v.ingresosArsTotal)}`} />
      </div>

      <Seccion titulo="Cobros sin acreditar">
        <p className="mb-2 text-xs text-subtle">Cobros aprobados que no se pudieron acreditar como vita+. Se revisan o reembolsan a mano.</p>
        {v.noAcreditados.length === 0 ? (
          <Vacio>No hay cobros sin acreditar.</Vacio>
        ) : (
          <Tabla>
            <thead>
              <tr>
                <th className={TH}>Fecha</th>
                <th className={TH}>Motivo</th>
                <th className={TH}>Monto</th>
                <th className={TH}>Estado MP</th>
                <th className={TH}>Pago</th>
                <th className={TH}>Cuenta</th>
              </tr>
            </thead>
            <tbody>
              {v.noAcreditados.map((n) => (
                <tr key={n.clave}>
                  <td className={TD}>{formatoFechaHoraAR(n.creado)}</td>
                  <td className={TD}>{n.motivo}</td>
                  <td className={TD}>{n.monto === null ? "—" : `${formatoARS(n.monto)}${n.moneda && n.moneda !== "ARS" ? ` ${n.moneda}` : ""}`}</td>
                  <td className={TD}>{n.estadoMp ?? "—"}</td>
                  <td className={TD}>{n.pagoId ?? "—"}</td>
                  <td className={TD}>{n.email ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </Seccion>

      <Seccion titulo="Pedidos de arrepentimiento">
        <p className="mb-2 text-xs text-subtle">Revocación dentro de los 10 días. El reembolso se procesa a mano; más nuevos primero.</p>
        {v.arrepentimientos.length === 0 ? (
          <Vacio>No hay pedidos de arrepentimiento.</Vacio>
        ) : (
          <Tabla>
            <thead>
              <tr>
                <th className={TH}>Solicitado</th>
                <th className={TH}>Cuenta</th>
                <th className={TH}>Plan</th>
                <th className={TH}>Monto</th>
              </tr>
            </thead>
            <tbody>
              {v.arrepentimientos.map((a) => (
                <tr key={a.id}>
                  <td className={TD}>{formatoFechaHoraAR(a.solicitado)}</td>
                  <td className={TD}>
                    <Link href={`/adminvita/usuarios/${a.usuarioId}`} className="font-bold text-teal-deep hover:underline">
                      {a.nombre || a.email || a.usuarioId.slice(0, 8)}
                    </Link>
                    <div className="text-xs text-subtle">{a.email}</div>
                  </td>
                  <td className={TD}>{a.plan ?? "—"}</td>
                  <td className={TD}>{a.arsPesos === null ? "—" : formatoARS(a.arsPesos)}</td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </Seccion>
    </>
  );
}
