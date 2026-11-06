import Link from "next/link";
import { entrarAlPanel, obtenerResumen, obtenerUsuariosEnLimite } from "@/lib/admin/datos";
import { formatoNumero, formatoPorcentaje, formatoUSD } from "@/lib/admin/formato";
import { VitaIcon } from "@/lib/vita-icons";
import { Card, Encabezado, ErrorDatos, Hero, Kpi, Pill, Seccion, fechaPill, nombreDeEmail } from "./_componentes/ui";

export const dynamic = "force-dynamic";

export default async function ResumenPage() {
  const admin = await entrarAlPanel("/adminvita");
  const [r, enLimite] = await Promise.all([obtenerResumen(), obtenerUsuariosEnLimite()]);
  if (!r) return <ErrorDatos />;

  const alertas = [
    { n: r.pagosNoAcreditados30d, texto: "cobros sin acreditar (30 días)", href: "/adminvita/vita-plus" },
    { n: r.arrepentimientos, texto: "pedidos de arrepentimiento registrados", href: "/adminvita/vita-plus" },
    { n: r.cronFallos24h, texto: "corridas de cron fallidas (24 h)", href: "/adminvita/sistema" },
    { n: r.httpFallos24h, texto: "llamadas HTTP del cron con error (24 h)", href: "/adminvita/sistema" },
  ].filter((a) => a.n > 0);

  return (
    <>
      <Encabezado titulo="Hola, " nombre={nombreDeEmail(admin.email)} derecha={<Pill icono="calendar">Hoy · {fechaPill()}</Pill>} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Hero
          titulo="Gasto de IA del mes"
          subtitulo="Costo acumulado de las respuestas de vita"
          valor={formatoUSD(r.costoMesUsd)}
          detalle={`${formatoUSD(r.costoHoyUsd)} hoy · ${formatoNumero(r.mensajesHoy)} respuestas`}
          href="/adminvita/ia"
        />
        <Card titulo="Alertas" subtitulo="Pendientes y fallos recientes" className="lg:col-span-2">
          {alertas.length === 0 ? (
            <p className="flex items-center gap-2 rounded-2xl bg-mint p-4 text-sm font-semibold text-teal-deep">
              <VitaIcon name="check" size={16} /> Todo en orden: sin pendientes ni fallos recientes.
            </p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {alertas.map((a) => (
                <li key={a.texto}>
                  <Link
                    href={a.href}
                    className="flex items-center gap-3 rounded-2xl bg-destructive/10 p-3 text-sm focus-visible:outline-2 focus-visible:outline-teal"
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
        </Card>
      </div>

      <Seccion titulo="Usuarios">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <Kpi titulo="Cuentas" valor={formatoNumero(r.usuariosTotal)} detalle={`${formatoNumero(r.gestionados)} perfiles gestionados`} href="/adminvita/usuarios" />
          <Kpi titulo="Nuevas" valor={formatoNumero(r.nuevos7d)} detalle={`7 días · ${formatoNumero(r.nuevos30d)} en 30 días`} />
          <Kpi titulo="Activos hoy" valor={formatoNumero(r.activosHoy)} detalle={`${formatoNumero(r.activos7d)} en 7 días`} tono="ok" />
          <Kpi titulo="Activos 30 días" valor={formatoNumero(r.activos30d)} />
          <Kpi titulo="vita+ activos" valor={formatoNumero(r.vitaPlusActivos)} href="/adminvita/vita-plus" />
          <Kpi titulo="Onboarding completo" valor={formatoPorcentaje(r.onboardingPct)} detalle="sin perfiles gestionados" />
        </div>
      </Seccion>

      <Seccion titulo="IA">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <Kpi titulo="Costo hoy" valor={formatoUSD(r.costoHoyUsd)} href="/adminvita/ia" />
          <Kpi titulo="Costo del mes" valor={formatoUSD(r.costoMesUsd)} />
          <Kpi titulo="Respuestas de vita hoy" valor={formatoNumero(r.mensajesHoy)} />
          <Kpi
            titulo="Usuarios que llegaron al límite hoy"
            valor={enLimite === null ? "—" : formatoNumero(enLimite)}
            detalle="de consultas con vita"
            tono={enLimite !== null && enLimite > 0 ? "alerta" : "neutro"}
          />
        </div>
      </Seccion>
    </>
  );
}
