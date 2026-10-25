import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { obtenerHistorial, type HistorialExportado } from "@/lib/exportar/nucleo";
import { nombreCompleto } from "@/lib/perfil/tipos";
import { rolSobre } from "@/lib/familia/perfil-activo";
import { VitaWordmark } from "@/components/vita/v-mark";
import { TopBar } from "../../top-bar";
import { BotonesExportar } from "./botones-exportar";

const ZONA = "America/Argentina/Buenos_Aires";

// "2026-10-11" (columna date) -> "11/10/2026". Se parte el string a mano
// para no pasar por Date y correr el día por la zona horaria.
function fechaSimple(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return a && m && d ? `${d}/${m}/${a}` : iso;
}

function fechaHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short", timeZone: ZONA }).format(
    new Date(iso)
  );
}

function hora(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("es-AR", { timeStyle: "short", timeZone: ZONA }).format(new Date(iso));
}

const MOMENTOS: Record<string, string> = { mañana: "Mañana", mediodia: "Mediodía", tarde: "Tarde", noche: "Noche" };
const COMIDAS: Record<string, string> = {
  antes: "Antes de comer",
  con: "Con la comida",
  despues: "Después de comer",
  "no-importa": "No importa",
};
const ESTADOS_VINCULO: Record<string, string> = {
  pendiente: "Invitación pendiente",
  aceptado: "Vinculado",
  revocado: "Revocado",
};

export default async function HistorialPage({ searchParams }: PageProps<"/app/perfil/historial">) {
  const usuario = await requireUser();
  const supabase = await createClient();
  // `?de=<id>`: exportar a alguien que cuido (solo con permiso Admin; la RLS
  // igual decide qué filas se leen). Cualquier otro valor cae al propio.
  const { de: deCrudo } = await searchParams;
  const de = Array.isArray(deCrudo) ? deCrudo[0] : deCrudo;
  const sobre = de && de !== usuario.id && (await rolSobre(de)) === "editar" ? de : usuario.id;

  let h: HistorialExportado | null = null;
  try {
    h = await obtenerHistorial(supabase, sobre);
  } catch {
    h = null;
  }

  return (
    <div className="reporte-historial flex flex-col gap-5 px-[18px] pt-1.5">
      <div className="no-imprimir">
        <TopBar volverA="/app/perfil/privacidad" eyebrow="Privacidad y datos" title={sobre === usuario.id ? "Exportar mi historial" : "Exportar historial"} />
      </div>

      <BotonesExportar de={sobre === usuario.id ? undefined : sobre} />

      {!h ? (
        <p className="rounded-[20px] bg-destructive/10 p-4 text-sm text-destructive">
          No pudimos armar tu historial. Intentá de nuevo en un momento.
        </p>
      ) : (
        <Reporte h={h} />
      )}
    </div>
  );
}

function Reporte({ h }: { h: HistorialExportado }) {
  const p = h.perfil;
  const stockPorId = new Map(h.stock_pastillas.map((i) => [i.id, i]));

  return (
    <article className="flex flex-col gap-5">
      <header className="flex flex-col gap-1.5 pt-1">
        <VitaWordmark size={30} tono="menta" />
        <h1 className="font-heading text-[22px] font-extrabold tracking-tight">
          Historial de salud{p?.nombre ? ` de ${nombreCompleto(p)}` : ""}
        </h1>
        <p className="text-[12.5px] text-muted-foreground">
          Generado el {fechaHora(h.generado_en)}
          {h.cuenta.email ? ` · ${h.cuenta.email}` : ""}
        </p>
      </header>

      <Seccion titulo="Perfil de salud">
        {!p ? (
          <Vacio />
        ) : (
          <div className="evitar-corte rounded-[20px] bg-card p-4.5 shadow-card">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Dato etiqueta="Nombre" valor={nombreCompleto(p) || p.nombre} />
              <Dato etiqueta="Fecha de nacimiento" valor={p.fecha_nacimiento ? fechaSimple(p.fecha_nacimiento) : null} />
              <Dato etiqueta="Género" valor={p.genero} />
              <Dato etiqueta="Grupo sanguíneo" valor={p.grupo_sanguineo} />
              <Dato etiqueta="Altura" valor={p.altura_cm != null ? `${p.altura_cm} cm` : null} />
              <Dato etiqueta="Peso" valor={p.peso_kg != null ? `${p.peso_kg} kg` : null} />
              <Dato etiqueta="Obra social" valor={p.obra_social} />
              <Dato etiqueta="N° de afiliado" valor={p.numero_afiliado} />
              <Dato etiqueta="Contacto de emergencia" valor={p.contacto_emergencia_nombre} />
              <Dato etiqueta="Teléfono de emergencia" valor={p.contacto_emergencia_telefono} />
            </dl>
            <dl className="mt-4 flex flex-col gap-3 border-t pt-3.5">
              <Dato
                etiqueta="Condiciones"
                valor={
                  p.condiciones.length > 0
                    ? p.condiciones.map((c) => `${c.label} (${c.tipo}${c.desde ? `, desde ${c.desde}` : ""})`).join(" · ")
                    : null
                }
              />
              <Dato etiqueta="Alergias" valor={p.alergias.length > 0 ? p.alergias.join(" · ") : null} />
            </dl>
          </div>
        )}
      </Seccion>

      <Seccion titulo="Medicamentos" cantidad={h.medicamentos.length}>
        {h.medicamentos.length === 0 ? (
          <Vacio />
        ) : (
          h.medicamentos.map((m) => {
            const stock = m.inventario_id ? stockPorId.get(m.inventario_id) : undefined;
            return (
              <Tarjeta key={m.id}>
                <div className="text-sm font-semibold">
                  {m.nombre}
                  {m.dosis ? ` · ${m.dosis} ${m.unidad}` : ""}
                </div>
                <div className="mt-1 text-[12.5px] text-muted-foreground">
                  {m.hora_programada} ({MOMENTOS[m.momento_dia] ?? m.momento_dia}) ·{" "}
                  {m.dias_recurrentes.length > 0 ? m.dias_recurrentes.join(", ") : "Todos los días"}
                </div>
                <div className="mt-1 text-[12.5px] text-muted-foreground">
                  {[
                    m.frecuencia,
                    COMIDAS[m.con_comida] ?? null,
                    m.duracion ? `Duración: ${m.duracion}` : null,
                    m.condicion ? `Para: ${m.condicion}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
                {m.notas && <div className="mt-1 text-[12.5px]">{m.notas}</div>}
                {stock && (
                  <div className="mt-1 text-[12.5px] font-semibold text-primary">
                    Stock: {stock.stock} {stock.stock === 1 ? "pastilla" : "pastillas"}
                  </div>
                )}
              </Tarjeta>
            );
          })
        )}
      </Seccion>

      <Seccion titulo="Historial de tomas" cantidad={h.tomas.length}>
        {h.tomas.length === 0 ? (
          <Vacio />
        ) : (
          <div className="rounded-[20px] bg-card px-4.5 py-2 shadow-card">
            {h.tomas.map((t) => (
              <div key={t.id} className="evitar-corte flex items-baseline justify-between gap-3 border-b py-2 last:border-b-0">
                <div className="min-w-0 text-[13px]">
                  <span className="font-semibold">{fechaSimple(t.fecha)}</span> · {t.medicamento}
                </div>
                <div className="shrink-0 text-[12px] text-muted-foreground">
                  {t.tomado ? `Tomada${t.tomado_en ? ` ${hora(t.tomado_en)}` : ""}` : "No tomada"}
                </div>
              </div>
            ))}
          </div>
        )}
      </Seccion>

      <Seccion titulo="Turnos médicos" cantidad={h.turnos.length}>
        {h.turnos.length === 0 ? (
          <Vacio />
        ) : (
          h.turnos.map((t) => (
            <Tarjeta key={t.id}>
              <div className="text-sm font-semibold">
                {t.especialidad}
                {t.profesional ? ` · ${t.profesional}` : ""}
              </div>
              <div className="mt-1 text-[12.5px] text-muted-foreground">
                {fechaSimple(t.fecha)} {t.hora}
                {t.lugar ? ` · ${t.lugar}` : ""}
                {t.acompanado ? " · Con acompañante" : ""}
              </div>
              {t.motivo && <div className="mt-1 text-[12.5px]">Motivo: {t.motivo}</div>}
              {t.notas && <div className="mt-1 text-[12.5px]">{t.notas}</div>}
            </Tarjeta>
          ))
        )}
      </Seccion>

      <Seccion titulo="Estudios médicos" cantidad={h.estudios.length}>
        {h.estudios.length === 0 ? (
          <Vacio />
        ) : (
          h.estudios.map((e) => (
            <Tarjeta key={e.id}>
              <div className="text-sm font-semibold">{e.tipo ?? "Estudio sin clasificar"}</div>
              <div className="mt-1 text-[12.5px] text-muted-foreground">
                {e.fecha ? fechaSimple(e.fecha) : `Cargado el ${fechaSimple(e.created_at)}`}
                {e.estado === "error" ? " · No se pudo leer automáticamente" : ""}
              </div>
              {e.resumen && <div className="mt-1.5 text-[12.5px] leading-snug">{e.resumen}</div>}
              {e.valores.length > 0 && (
                <ul className="mt-1.5 flex flex-col gap-0.5 text-[12.5px]">
                  {e.valores.map((v, i) => (
                    <li key={`${v.nombre}-${i}`}>
                      <span className="font-semibold">{v.nombre}:</span> {v.valor}
                    </li>
                  ))}
                </ul>
              )}
            </Tarjeta>
          ))
        )}
      </Seccion>

      <Seccion titulo="Cuidado compartido">
        <div className="flex flex-col gap-2.5">
          <Subtitulo>Personas que pueden ver tu adherencia</Subtitulo>
          {h.cuidadores.length === 0 ? (
            <Vacio />
          ) : (
            h.cuidadores.map((c, i) => (
              <Tarjeta key={`${c.email_invitado}-${i}`}>
                <div className="text-sm font-semibold">{c.email_invitado || "Vínculo por código"}</div>
                <div className="mt-1 text-[12.5px] text-muted-foreground">
                  {ESTADOS_VINCULO[c.estado] ?? c.estado} · desde {fechaSimple(c.invitado_el)}
                </div>
              </Tarjeta>
            ))
          )}

          <Subtitulo>Personas que cuidás</Subtitulo>
          {h.personas_que_cuido.length === 0 ? (
            <Vacio />
          ) : (
            h.personas_que_cuido.map((e, i) => (
              <Tarjeta key={`${e.nombre}-${i}`}>
                <div className="text-sm font-semibold">{e.nombre}</div>
              </Tarjeta>
            ))
          )}

          {h.borradores_de_personas_que_cuido.length > 0 && (
            <>
              <Subtitulo>Perfiles que armaste para otras personas</Subtitulo>
              {h.borradores_de_personas_que_cuido.map((b, i) => (
                <Tarjeta key={`${b.nombre}-${i}`}>
                  <div className="text-sm font-semibold">
                    {b.nombre}
                    {b.relacion ? ` (${b.relacion})` : ""}
                    {b.edad != null ? ` · ${b.edad} años` : ""}
                  </div>
                  <div className="mt-1 text-[12.5px] text-muted-foreground">
                    {b.estado === "vinculado" ? "Vinculado" : "Borrador"} · creado el {fechaSimple(b.creado_el)}
                  </div>
                  {b.medicamentos.length > 0 && (
                    <ul className="mt-1.5 flex flex-col gap-0.5 text-[12.5px]">
                      {b.medicamentos.map((m, j) => (
                        <li key={`${m.nombre}-${j}`}>
                          {m.nombre}
                          {m.dosis ? ` ${m.dosis} ${m.unidad}` : ""} · {m.hora_programada}
                        </li>
                      ))}
                    </ul>
                  )}
                </Tarjeta>
              ))}
            </>
          )}
        </div>
      </Seccion>

      <Seccion titulo="Conversaciones con vita" cantidad={h.conversaciones.length}>
        {h.conversaciones.length === 0 ? (
          <Vacio />
        ) : (
          h.conversaciones.map((c) => (
            <div key={c.id} className="rounded-[20px] bg-card p-4.5 shadow-card">
              <div className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-primary">
                {fechaHora(c.iniciada_el)}
              </div>
              <div className="flex flex-col gap-2">
                {c.mensajes.map((m, i) => (
                  <div key={i} className="evitar-corte text-[13px] leading-snug">
                    <span className="font-semibold">{m.role === "user" ? "Vos" : "vita"}:</span>{" "}
                    <span className="whitespace-pre-wrap">{m.contenido}</span>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </Seccion>

      <p className="pb-2 text-center text-[11px] leading-snug text-muted-foreground">
        Este reporte contiene datos de salud personales. Compartilo solo con quien vos decidas. vita no reemplaza la
        consulta con un profesional de la salud.
      </p>
    </article>
  );
}

function Seccion({ titulo, cantidad, children }: { titulo: string; cantidad?: number; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="titulo-seccion px-1.5 font-heading text-[16px] font-bold">
        {titulo}
        {cantidad != null && cantidad > 0 && (
          <span className="ml-2 text-[12px] font-semibold text-muted-foreground">{cantidad}</span>
        )}
      </h2>
      {children}
    </section>
  );
}

function Subtitulo({ children }: { children: React.ReactNode }) {
  return <h3 className="titulo-seccion px-1.5 pt-1 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">{children}</h3>;
}

function Tarjeta({ children }: { children: React.ReactNode }) {
  return <div className="evitar-corte rounded-[20px] bg-card p-4 shadow-card">{children}</div>;
}

function Vacio() {
  return <p className="px-1.5 text-[13px] text-muted-foreground">Todavía no hay registros</p>;
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{etiqueta}</dt>
      <dd className="mt-0.5 break-words text-[13.5px]">{valor || "—"}</dd>
    </div>
  );
}
