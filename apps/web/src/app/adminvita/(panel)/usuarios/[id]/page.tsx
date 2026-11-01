import { notFound } from "next/navigation";
import Link from "next/link";
import { entrarAlPanel, obtenerUsuario } from "@/lib/admin/datos";
import {
  ETIQUETA_TIPO_CUENTA,
  formatoARS,
  formatoDiaCorto,
  formatoFechaAR,
  formatoFechaHoraAR,
  formatoNumero,
  formatoUSD,
  resumenVitaPlus,
} from "@/lib/admin/formato";
import { FormularioPush } from "./formulario-push";
import { BarrasDiarias, ChipInactividad, ErrorDatos, Etiqueta, Kpi, Seccion, TD, TH, Tabla, Vacio } from "../../_componentes/ui";

export const dynamic = "force-dynamic";

const CONTEOS: [string, string][] = [
  ["medicamentos", "Medicamentos"],
  ["turnos", "Turnos"],
  ["mediciones", "Mediciones"],
  ["estudios", "Estudios"],
  ["consultas", "Consultas"],
  ["vacunas", "Vacunas"],
  ["recuerdos", "Recuerdos vigentes"],
  ["sesiones_chat", "Sesiones de chat"],
  ["dispositivos_push", "Dispositivos con push"],
];

export default async function UsuarioPage({ params }: PageProps<"/adminvita/usuarios/[id]">) {
  const { id } = await params;
  await entrarAlPanel(`/adminvita/usuarios/${id.slice(0, 64)}`);
  const resultado = await obtenerUsuario(id);
  if (resultado.estado === "no_existe") notFound();
  if (resultado.estado === "error") return <ErrorDatos />;
  const d = resultado.datos;
  const c = d.cuenta;
  const costo30 = d.usoDiario.reduce((a, x) => a + x.costoUsd, 0);
  const tokens30 = d.usoDiario.reduce((a, x) => a + x.tokensInput + x.tokensOutput, 0);

  return (
    <>
      <Link href="/adminvita/usuarios" className="text-sm font-bold text-teal-deep">
        ← Usuarios
      </Link>
      <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-ink">{c.nombre || c.email}</h1>
      <p className="text-sm text-subtle">{c.email}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <ChipInactividad dias={c.diasInactivo} />
        <Etiqueta>{ETIQUETA_TIPO_CUENTA[c.tipo] ?? c.tipo}</Etiqueta>
        {c.vitaPlus ? (
          <Etiqueta tono="ok">
            {resumenVitaPlus(c).etiqueta}
            {resumenVitaPlus(c).detalle ? ` · ${resumenVitaPlus(c).detalle}` : ""}
          </Etiqueta>
        ) : null}
        {!c.onboarding ? <Etiqueta tono="aviso">Sin onboarding</Etiqueta> : null}
        {!c.emailConfirmado ? <Etiqueta tono="alerta">Email sin confirmar</Etiqueta> : null}
        {!c.memoriaActiva ? <Etiqueta>Memoria apagada</Etiqueta> : null}
      </div>

      <Seccion titulo="Cuenta">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi titulo="Alta" valor={formatoFechaAR(c.creado)} />
          <Kpi titulo="Último ingreso" valor={formatoFechaAR(c.ultimoLogin)} />
          <Kpi titulo="Última actividad" valor={formatoFechaHoraAR(c.ultimaActividad)} />
          <Kpi
            titulo="vita+"
            valor={!c.vitaPlus ? "—" : c.permanente ? "Sin vencimiento" : c.vence ? formatoFechaAR(c.vence) : "—"}
            detalle={c.vitaPlus ? resumenVitaPlus(c).etiqueta : undefined}
          />
        </div>
      </Seccion>

      <Seccion titulo="Enviar notificación">
        <FormularioPush usuarioId={c.id} dispositivos={d.conteos.dispositivos_push ?? 0} />
      </Seccion>

      <Seccion titulo="Uso de IA (30 días)">
        <div className="mb-3 grid grid-cols-2 gap-3">
          <Kpi titulo="Costo" valor={formatoUSD(costo30)} />
          <Kpi titulo="Tokens" valor={formatoNumero(tokens30)} />
        </div>
        <BarrasDiarias
          titulo="Costo diario (USD)"
          barras={[...d.usoDiario].reverse().map((x) => ({ etiqueta: formatoDiaCorto(x.fecha), valor: x.costoUsd, detalle: formatoUSD(x.costoUsd) }))}
        />
      </Seccion>

      <Seccion titulo="Cantidad de datos (solo conteos)">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {CONTEOS.map(([k, etiqueta]) => (
            <Kpi key={k} titulo={etiqueta} valor={formatoNumero(d.conteos[k] ?? 0)} />
          ))}
        </div>
      </Seccion>

      <Seccion titulo="Vínculos">
        <div className="grid gap-3 md:grid-cols-2">
          {([
            ["Sus cuidadores", d.cuidadores],
            ["Personas que cuida", d.cuidaA],
          ] as const).map(([titulo, filas]) => (
            <div key={titulo} className="rounded-[var(--radius-item)] border border-line bg-paper p-4 shadow-item">
              <p className="eyebrow">{titulo}</p>
              {filas.length === 0 ? (
                <p className="mt-2 text-sm text-subtle">Ninguno.</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm">
                  {filas.map((f) => (
                    <li key={f.id}>
                      <Link href={`/adminvita/usuarios/${f.id}`} className="font-bold text-teal-deep hover:underline">
                        {f.nombre || f.id.slice(0, 8)}
                      </Link>{" "}
                      <span className="text-xs text-subtle">
                        {f.rol === "editar" ? "Admin" : "Lector"} · desde {formatoFechaAR(f.desde)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </Seccion>

      <Seccion titulo="Suscripciones y pagos">
        {d.suscripciones.length === 0 && d.pagos.length === 0 ? (
          <Vacio>Sin suscripciones ni pagos.</Vacio>
        ) : (
          <div className="space-y-3">
            <Tabla>
              <thead>
                <tr>
                  <th className={TH}>Plan</th>
                  <th className={TH}>Estado</th>
                  <th className={TH}>Monto</th>
                  <th className={TH}>Creada</th>
                </tr>
              </thead>
              <tbody>
                {d.suscripciones.map((s) => (
                  <tr key={`${s.creada}-${s.plan}`}>
                    <td className={TD}>{s.plan}</td>
                    <td className={TD}>
                      <Etiqueta tono={s.estado === "authorized" ? "ok" : s.estado === "cancelled" ? "alerta" : "neutro"}>{s.estado}</Etiqueta>
                    </td>
                    <td className={TD}>{formatoARS(s.arsPesos)}</td>
                    <td className={TD}>{formatoFechaHoraAR(s.creada)}</td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
            {d.pagos.length > 0 ? (
              <Tabla>
                <thead>
                  <tr>
                    <th className={TH}>Pago</th>
                    <th className={TH}>Monto</th>
                    <th className={TH}>Meses</th>
                    <th className={TH}>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {d.pagos.map((p) => (
                    <tr key={p.pagoId}>
                      <td className={TD}>{p.pagoId}</td>
                      <td className={TD}>{formatoARS(p.arsPesos)}</td>
                      <td className={TD}>{p.meses}</td>
                      <td className={TD}>{formatoFechaHoraAR(p.creado)}</td>
                    </tr>
                  ))}
                </tbody>
              </Tabla>
            ) : null}
          </div>
        )}
      </Seccion>
    </>
  );
}
