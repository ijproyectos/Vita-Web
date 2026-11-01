import Link from "next/link";
import { entrarAlPanel, obtenerResumen } from "@/lib/admin/datos";
import { formatoNumero, formatoPorcentaje, formatoUSD } from "@/lib/admin/formato";
import { VitaIcon } from "@/lib/vita-icons";
import { ErrorDatos, Kpi, Seccion } from "./_componentes/ui";

export const dynamic = "force-dynamic";

export default async function ResumenPage() {
  await entrarAlPanel("/adminvita");
  const r = await obtenerResumen();
  if (!r) return <ErrorDatos />;

  const alertas = [
    { n: r.pagosNoAcreditados30d, texto: "cobros sin acreditar (30 días)", href: "/adminvita/vita-plus" },
    { n: r.arrepentimientos, texto: "pedidos de arrepentimiento registrados", href: "/adminvita/vita-plus" },
    { n: r.cronFallos24h, texto: "corridas de cron fallidas (24 h)", href: "/adminvita/sistema" },
    { n: r.httpFallos24h, texto: "llamadas HTTP del cron con error (24 h)", href: "/adminvita/sistema" },
  ].filter((a) => a.n > 0);

  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight text-ink">Resumen</h1>

      <Seccion titulo="Alertas">
        {alertas.length === 0 ? (
          <p className="flex items-center gap-2 rounded-[var(--radius-item)] border border-teal-line bg-mint p-4 text-sm font-semibold text-teal-deep">
            <VitaIcon name="check" size={16} /> Todo en orden: sin pendientes ni fallos recientes.
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {alertas.map((a) => (
              <li key={a.texto}>
                <Link
                  href={a.href}
                  className="flex items-center gap-3 rounded-[var(--radius-item)] border border-destructive/40 bg-paper p-3 text-sm shadow-item"
                >
                  <VitaIcon name="alert-triangle" size={18} className="text-destructive" />
                  <span>
                    <strong className="text-destructive">{formatoNumero(a.n)}</strong> {a.texto}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Seccion>

      <Seccion titulo="Usuarios">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi titulo="Cuentas" valor={formatoNumero(r.usuariosTotal)} detalle={`${formatoNumero(r.gestionados)} perfiles gestionados`} />
          <Kpi titulo="Nuevas" valor={formatoNumero(r.nuevos7d)} detalle={`7 días · ${formatoNumero(r.nuevos30d)} en 30 días`} />
          <Kpi titulo="Activos hoy" valor={formatoNumero(r.activosHoy)} detalle={`${formatoNumero(r.activos7d)} en 7 días`} tono="ok" />
          <Kpi titulo="Activos 30 días" valor={formatoNumero(r.activos30d)} />
          <Kpi titulo="vita+ activos" valor={formatoNumero(r.vitaPlusActivos)} />
          <Kpi titulo="Onboarding completo" valor={formatoPorcentaje(r.onboardingPct)} detalle="sin perfiles gestionados" />
        </div>
      </Seccion>

      <Seccion titulo="IA">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi titulo="Costo hoy" valor={formatoUSD(r.costoHoyUsd)} />
          <Kpi titulo="Costo del mes" valor={formatoUSD(r.costoMesUsd)} />
          <Kpi titulo="Respuestas de vita hoy" valor={formatoNumero(r.mensajesHoy)} />
        </div>
      </Seccion>
    </>
  );
}
