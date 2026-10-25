import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import * as compartirNucleo from "@/lib/compartir/nucleo";
import type { ResumenProfesional } from "@/lib/compartir/tipos";
import { VitaWordmark } from "@/components/vita/v-mark";
import { BotonImprimir } from "./boton-imprimir";

// Página PÚBLICA (sin login) con el resumen de salud que un paciente le
// comparte a su profesional. Todo el acceso pasa por la RPC
// `resumen_profesional` (security definer): null = inexistente, vencido o
// revocado, sin distinguir el caso. Nunca indexable y sin Referer.
export const metadata: Metadata = {
  title: "Resumen de salud",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const ZONA = "America/Argentina/Buenos_Aires";
const MOMENTOS = [
  { clave: "mañana", label: "Mañana" },
  { clave: "mediodia", label: "Mediodía" },
  { clave: "tarde", label: "Tarde" },
  { clave: "noche", label: "Noche" },
] as const;
const COMIDAS: Record<string, string> = {
  ayunas: "En ayunas",
  antes: "Antes de comer",
  con: "Con la comida",
  despues: "Después de comer",
};

// "2026-10-11" (columna date) -> "11/10/2026", sin pasar por Date.
function fechaSimple(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return a && m && d ? `${d}/${m}/${a}` : iso;
}

function fechaLarga(iso: string): string {
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "long", timeStyle: "short", timeZone: ZONA }).format(
    new Date(iso)
  );
}

export default async function ResumenPublicoPage({ params }: PageProps<"/p/[token]">) {
  const { token } = await params;
  const supabase = await createClient();
  const resumen = await compartirNucleo.obtenerResumenPublico(supabase, token);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-5 px-5 pb-16 pt-6">
      {resumen ? <Resumen r={resumen} /> : <NoDisponible />}
    </div>
  );
}

function NoDisponible() {
  return (
    <div className="mt-16 flex flex-col items-center gap-4 text-center">
      <VitaWordmark size={30} tono="menta" />
      <h1 className="font-heading text-[22px] font-extrabold tracking-tight">Este link ya no está disponible</h1>
      <p className="max-w-xs text-sm text-muted-foreground">
        Si necesitás ver el resumen, pedile al paciente que te comparta uno nuevo.
      </p>
    </div>
  );
}

function Resumen({ r }: { r: ResumenProfesional }) {
  const p = r.paciente;
  const edad = p.edad != null ? `${p.edad} años` : p.edad_rango;
  const porMomento = MOMENTOS.map((m) => ({
    ...m,
    meds: r.medicamentos.filter((x) => x.momento === m.clave),
  })).filter((m) => m.meds.length > 0);
  const contacto = r.contacto_emergencia;

  return (
    <article className="reporte-historial flex flex-col gap-5">
      <header className="flex flex-col gap-1.5 pt-1">
        <div className="flex items-center justify-between gap-3">
          <VitaWordmark size={30} tono="menta" />
          <BotonImprimir />
        </div>
        <h1 className="mt-2 font-heading text-[26px] font-extrabold leading-tight tracking-tight">
          Resumen de salud{p.nombre ? ` de ${p.nombre}` : ""}
        </h1>
        <p className="text-[12.5px] text-muted-foreground">
          Compartido a través de vita · Vigente hasta {fechaLarga(r.vigente_hasta)}
        </p>
      </header>

      <Seccion titulo="Datos del paciente">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Dato etiqueta="Edad" valor={edad} />
          <Dato etiqueta="Sexo" valor={p.genero} />
          <Dato etiqueta="Grupo sanguíneo" valor={p.grupo_sanguineo} />
          <Dato etiqueta="Obra social" valor={p.obra_social} />
          <Dato etiqueta="Altura" valor={p.altura_cm != null ? `${p.altura_cm} cm` : null} />
          <Dato etiqueta="Peso" valor={p.peso_kg != null ? `${p.peso_kg} kg` : null} />
        </dl>
      </Seccion>

      <Seccion titulo="Condiciones y alergias">
        <dl className="flex flex-col gap-3">
          <Dato
            etiqueta="Condiciones"
            valor={
              r.condiciones.length > 0
                ? r.condiciones.map((c) => `${c.label} (${c.tipo}${c.desde ? `, desde ${c.desde}` : ""})`).join(" · ")
                : null
            }
          />
          <Dato etiqueta="Alergias" valor={r.alergias.length > 0 ? r.alergias.join(" · ") : null} />
        </dl>
      </Seccion>

      <Seccion titulo="Medicamentos" cantidad={r.medicamentos.length}>
        {r.medicamentos.length === 0 ? (
          <Vacio />
        ) : (
          <ul className="flex flex-col divide-y">
            {r.medicamentos.map((m, i) => (
              <li key={i} className="py-2.5 first:pt-0 last:pb-0">
                <div className="text-[15px] font-semibold">
                  {m.nombre}
                  {m.dosis ? ` · ${m.dosis} ${m.unidad}` : ""}
                </div>
                <div className="mt-0.5 text-[13px] text-muted-foreground">
                  {m.hora} · {m.dias.length > 0 ? m.dias.join(", ") : "Todos los días"}
                </div>
                <div className="mt-0.5 text-[13px] text-muted-foreground">
                  {[
                    m.frecuencia,
                    COMIDAS[m.con_comida] ?? null,
                    m.duracion ? `Duración: ${m.duracion}` : null,
                    m.condicion ? `Para: ${m.condicion}` : null,
                    m.pastillas_restantes != null ? `Quedan ${m.pastillas_restantes} pastillas` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
                {m.notas && <div className="mt-0.5 text-[13px]">{m.notas}</div>}
              </li>
            ))}
          </ul>
        )}
      </Seccion>

      <Seccion titulo="Rutina diaria de tomas">
        {porMomento.length === 0 ? (
          <Vacio />
        ) : (
          <div className="flex flex-col gap-3.5">
            {porMomento.map((m) => (
              <div key={m.clave}>
                <div className="text-[12px] font-bold uppercase tracking-wide text-primary">{m.label}</div>
                <ul className="mt-1 flex flex-col gap-1">
                  {m.meds.map((x, i) => (
                    <li key={i} className="flex gap-3 text-[14px]">
                      <span className="w-12 shrink-0 font-semibold tabular-nums">{x.hora}</span>
                      <span>
                        {x.nombre}
                        {x.dosis ? ` ${x.dosis} ${x.unidad}` : ""}
                        {COMIDAS[x.con_comida] ? ` · ${COMIDAS[x.con_comida]}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Seccion>

      <Seccion titulo={`Cumplimiento de las tomas (últimos ${r.adherencia.dias} días)`}>
        {r.adherencia.programadas === 0 ? (
          <Vacio />
        ) : (
          <div className="flex flex-col gap-3">
            <div className="text-[14px]">
              <span className="font-heading text-[26px] font-extrabold">{r.adherencia.porcentaje ?? 0}%</span>{" "}
              <span className="text-muted-foreground">
                · {r.adherencia.tomadas} de {r.adherencia.programadas} tomas registradas (incluye el día de hoy)
              </span>
            </div>
            <ul className="flex flex-col gap-1">
              {r.adherencia.por_dia.map((d) => (
                <li key={d.fecha} className="evitar-corte flex items-center gap-3 text-[12.5px]">
                  <span className="w-20 shrink-0 tabular-nums text-muted-foreground">{fechaSimple(d.fecha)}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                    <span
                      className="block h-full rounded-full bg-primary"
                      style={{ width: `${d.programadas > 0 ? Math.round((100 * d.tomadas) / d.programadas) : 0}%` }}
                    />
                  </span>
                  <span className="w-12 shrink-0 text-right tabular-nums">
                    {d.tomadas}/{d.programadas}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Seccion>

      <Seccion titulo="Próximos turnos" cantidad={r.turnos.length}>
        {r.turnos.length === 0 ? (
          <Vacio />
        ) : (
          <ul className="flex flex-col divide-y">
            {r.turnos.map((t, i) => (
              <li key={i} className="py-2.5 first:pt-0 last:pb-0">
                <div className="text-[15px] font-semibold">{t.especialidad}</div>
                <div className="mt-0.5 text-[13px] text-muted-foreground">
                  {fechaSimple(t.fecha)} · {t.hora}
                  {t.profesional ? ` · ${t.profesional}` : ""}
                  {t.lugar ? ` · ${t.lugar}` : ""}
                </div>
                {t.motivo && <div className="mt-0.5 text-[13px]">{t.motivo}</div>}
              </li>
            ))}
          </ul>
        )}
      </Seccion>

      <Seccion titulo="Estudios recientes" cantidad={r.estudios.length}>
        {r.estudios.length === 0 ? (
          <Vacio />
        ) : (
          <ul className="flex flex-col divide-y">
            {r.estudios.map((e, i) => (
              <li key={i} className="py-2.5 first:pt-0 last:pb-0">
                <div className="text-[15px] font-semibold">
                  {e.tipo ?? "Estudio"} · {fechaSimple(e.fecha)}
                </div>
                {e.resumen && <div className="mt-0.5 text-[13px]">{e.resumen}</div>}
                {e.valores.length > 0 && (
                  <div className="mt-0.5 text-[13px] text-muted-foreground">
                    {e.valores.map((v) => `${v.nombre}: ${v.valor}`).join(" · ")}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Seccion>

      <Seccion titulo="Contacto de emergencia">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Dato etiqueta="Nombre" valor={contacto.nombre} />
          <Dato etiqueta="Teléfono" valor={contacto.telefono} />
        </dl>
      </Seccion>

      <p className="px-1 text-center text-[12px] leading-snug text-muted-foreground">
        Información cargada por el paciente; no reemplaza la historia clínica.
      </p>
    </article>
  );
}

function Seccion({ titulo, cantidad, children }: { titulo: string; cantidad?: number; children: React.ReactNode }) {
  return (
    <section className="evitar-corte flex flex-col gap-2.5">
      <h2 className="titulo-seccion px-1 font-heading text-[16px] font-bold tracking-tight">
        {titulo}
        {cantidad != null && <span className="ml-2 text-[13px] font-semibold text-muted-foreground">{cantidad}</span>}
      </h2>
      <div className="rounded-[20px] bg-card p-4.5 shadow-card">{children}</div>
    </section>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string | null | undefined }) {
  return (
    <div>
      <dt className="text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">{etiqueta}</dt>
      <dd className="mt-0.5 text-[15px] font-medium">{valor || "—"}</dd>
    </div>
  );
}

function Vacio() {
  return <p className="text-[13px] text-muted-foreground">Sin datos cargados.</p>;
}
