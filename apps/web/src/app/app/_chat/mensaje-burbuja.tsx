import type { ReactNode } from "react";
import { fechaTurnoEnPalabras } from "@/lib/turnos/formato";
import { agruparTarjetas, tituloHoyGuardado, type Tarjeta, type TarjetaAgrupada } from "@/lib/chat/tarjetas";
import { REMEDIOS_TARJETA_VISIBLES, leerItemsHoy, leerItemsRemedios, type ItemHoy, type ItemRemedio } from "@/lib/chat/tarjeta-rutina";
import Link from "next/link";
import { VitaAvatar } from "@/components/vita/v-mark";
import { VitaIcon } from "@/lib/vita-icons";
import { cn } from "@/lib/utils";
import { datosDeMemoria, TarjetaMemoria } from "./tarjeta-memoria";

export type MensajeChatUI = {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  /** Saludo inicial local (no es parte del hilo guardado). */
  bienvenida?: boolean;
  /** Tarjetas de este mensaje, en el orden en que llegaron. */
  tarjetas?: Tarjeta[];
  /** Vino del historial: "Hoy" muestra de cuándo es. */
  guardado?: boolean;
  // Botones de respuesta rápida (confirmaciones de familia), armados por el servidor.
  opciones?: string[];
  // Opción afirmativa -> id de la acción pendiente en el servidor (confirmación atada).
  vinculos?: Record<string, string>;
  // Si este mensaje del usuario salió de un botón atado: se reenvía igual al reintentar.
  confirmacionId?: string;
  // Reintento sin duplicar: el pedido que se le mandó al servidor, y si no hubo respuesta.
  pedidoId?: string;
  sinRespuesta?: boolean;
  // Respuesta de vita que se cortó a mitad del stream: se conserva el texto parcial.
  interrumpido?: boolean;
};

// Burbujas del chat con vita — porta Message/ActionCard de VitaChat.jsx.
export function MensajeBurbuja({ m, cargando, alCerrar, esPropio, alReintentar, alElegirOpcion }: { m: MensajeChatUI; cargando: boolean; alCerrar: () => void; esPropio: boolean; alReintentar?: (m: MensajeChatUI) => void; alElegirOpcion?: (texto: string, confirmacionId?: string) => void }) {
  if (m.role === "user") {
    return (
      <div className="mb-2.5 flex flex-col items-end gap-1">
        <div className="max-w-[78%] rounded-[20px] rounded-br-[6px] bg-primary px-3.5 py-2.5 text-[14.5px] font-medium leading-snug text-primary-foreground">
          {m.content}
        </div>
        {m.sinRespuesta && alReintentar && (
          <div className="flex items-center gap-2 text-[12px] font-semibold text-destructive">
            <span>Sin respuesta</span>
            <button
              type="button"
              onClick={() => alReintentar(m)}
              className="rounded-full bg-card px-3 py-1 font-bold text-teal-deep shadow-item"
            >
              Reintentar
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mb-2.5 flex flex-col gap-2">
      <div className="flex items-end gap-2">
        <VitaAvatar size={26} />
        <div className="max-w-[78%] rounded-[20px] rounded-bl-[6px] bg-card px-3.5 py-2.5 text-[14.5px] font-medium leading-snug text-foreground shadow-item">
          {cargando ? <PuntosEscribiendo /> : m.content}
          {m.interrumpido && (
            <p className="mt-1.5 text-[12px] font-semibold text-destructive">Respuesta interrumpida</p>
          )}
        </div>
      </div>
      {agruparTarjetas(m.tarjetas ?? []).map((t, i) => (
        <TarjetaAccion key={`${t.type}-${i}`} accion={t} alCerrar={alCerrar} esPropio={esPropio} guardadoEn={m.guardado ? m.timestamp : undefined} />
      ))}
      {m.opciones && m.opciones.length > 0 && alElegirOpcion && (
        <div className="flex flex-wrap gap-2 pl-9" role="group" aria-label="Respuestas rápidas">
          {m.opciones.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => alElegirOpcion(o, m.vinculos?.[o])}
              className="min-h-11 rounded-full bg-card px-4 py-2.5 text-[14.5px] font-bold text-teal-deep shadow-[inset_0_0_0_1px_var(--teal-100)]"
            >
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PuntosEscribiendo() {
  return (
    <span className="flex gap-1 py-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-1.5 animate-pulse rounded-full bg-primary"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}

// /app/rutina, /app/medicamentos y /app/turnos listan el perfil ACTIVO. Los
// enlaces solo valen si la acción fue sobre uno mismo y el activo es el propio;
// si fue sobre un familiar (accion.persona) la tarjeta dice para quién y no
// enlaza (evita llevar a la pantalla de otra persona sin cambiar de perfil).
function TarjetaAccion({
  accion,
  alCerrar,
  esPropio,
  guardadoEn,
}: {
  accion: TarjetaAgrupada;
  alCerrar: () => void;
  esPropio: boolean;
  guardadoEn?: string;
}) {
  if (isGrupo(accion)) return <TarjetaGrupo grupo={accion} esPropio={esPropio} alCerrar={alCerrar} />;

  const persona = typeof accion.persona === "string" ? accion.persona : null;
  const editable = esPropio && !persona;
  const base = "ml-9 w-[82%] rounded-[20px] rounded-bl-[6px] bg-card p-3.5 shadow-card";

  switch (accion.type) {
    case "medication_added":
      return (
        <div className={base}>
          <CabeceraTarjeta icon="pill" texto={persona ? `Agregado a ${persona}` : "Medicamento agregado"} />
          <div className="mt-2.5 rounded-[var(--radius-item)] bg-secondary px-3.5 py-3">
            <div className="font-heading text-[15px] font-extrabold tracking-[-0.02em]">{String(accion.name)}</div>
            <div className="mt-0.5 text-xs font-medium text-subtle">
              {[accion.dose, accion.time && `${accion.time} hs`].filter(Boolean).join(" · ")}
            </div>
          </div>
          <BotonesTarjeta>
            {editable && typeof accion.id === "string" && (
              <EnlaceTarjeta alCerrar={alCerrar} href={`/app/medicamentos?editar=${accion.id}`} texto="Ajustar detalles" primario grupo />
            )}
            {editable && <EnlaceTarjeta alCerrar={alCerrar} href="/app/rutina" texto="Ver en Rutina" grupo />}
          </BotonesTarjeta>
        </div>
      );
    case "appointment_added":
      return (
        <div className={base}>
          <CabeceraTarjeta icon="stethoscope" texto={persona ? `Turno agendado para ${persona}` : "Turno agendado"} />
          <div className="mt-2.5 rounded-[var(--radius-item)] bg-secondary px-3.5 py-3">
            <div className="font-heading text-[15px] font-extrabold tracking-[-0.02em]">{String(accion.specialty)}</div>
            <div className="mt-0.5 text-xs font-medium text-subtle">
              {fechaTurnoEnPalabras(String(accion.date))} · {String(accion.time).slice(0, 5)} hs
            </div>
          </div>
          <BotonesTarjeta>
            {editable && typeof accion.id === "string" && (
              <EnlaceTarjeta alCerrar={alCerrar} href={`/app/turnos?editar=${accion.id}`} texto="Completar turno" primario grupo />
            )}
            {editable && <EnlaceTarjeta alCerrar={alCerrar} href="/app/rutina" texto="Ver en Rutina" grupo />}
          </BotonesTarjeta>
        </div>
      );
    case "show_today_medications":
      return <TarjetaHoy items={leerItemsHoy(accion.items)} persona={persona} editable={editable} alCerrar={alCerrar} guardadoEn={guardadoEn} />;
    case "show_all_medications":
      return <TarjetaRemedios items={leerItemsRemedios(accion.items)} persona={persona} editable={editable} alCerrar={alCerrar} />;
    case "medication_taken":
      return (
        <div className={cn(base, "flex items-center gap-2.5 py-3")}>
          <IconoTomada />
          <span className="min-w-0 flex-1 break-words text-[13.5px] font-bold">{String(accion.medication_name)}</span>
          <span className="shrink-0 text-[12.5px] font-semibold text-slate-brand">
            {persona ? `Anotada a ${persona}` : "Tomada"}
            {typeof accion.time === "string" ? ` · ${accion.time}` : ""}
          </span>
        </div>
      );
    case "all_medications_taken":
      if (typeof accion.count !== "number" || accion.count <= 0) return null;
      return (
        <div className={cn(base, "flex items-center gap-2.5 py-3")}>
          <IconoTomada />
          <span className="text-[13.5px] font-bold">
            {accion.count === 1 ? "1 toma anotada" : `${accion.count} tomas anotadas`}
            {persona ? ` a ${persona}` : ""}
          </span>
        </div>
      );
    case "profile_updated":
      return <FilaConfirmada texto={persona ? `Perfil de ${persona} actualizado` : "Perfil actualizado"} />;
    case "condition_added":
      return <FilaConfirmada texto={typeof accion.label === "string" ? accion.label : "Condición"} detalle={persona ? `Agregada a ${persona}` : "Condición agregada"} />;
    case "allergy_added":
      return <FilaConfirmada texto={typeof accion.name === "string" ? accion.name : "Alergia"} detalle={persona ? `Agregada a ${persona}` : "Alergia agregada"} />;
    case "open_screen": {
      // Solo navegación: se muestra aunque sea de otra persona. Defensivo con el href.
      if (typeof accion.href !== "string" || !(accion.href === "/app" || accion.href.startsWith("/app/"))) return null;
      const label = typeof accion.label === "string" && accion.label.trim() !== "" ? accion.label : "esta pantalla";
      return (
        <div className={cn(base, "py-3")}>
          <EnlaceTarjeta alCerrar={alCerrar} href={accion.href} texto={`Abrir ${label}`} primario inline grupo />
        </div>
      );
    }
    case "memoria_guardada": {
      const datos = datosDeMemoria(accion);
      return datos ? <TarjetaMemoria key={datos.id} datos={datos} alCerrar={alCerrar} /> : null;
    }
    default:
      return null;
  }
}

function isGrupo(t: TarjetaAgrupada): t is Extract<TarjetaAgrupada, { type: "grupo" }> {
  return t.type === "grupo" && Array.isArray((t as { items?: unknown }).items);
}

function IconoTomada() {
  return (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
      <VitaIcon name="check" size={15} strokeWidth={2.8} />
    </span>
  );
}

function BotonesTarjeta({ children }: { children: ReactNode }) {
  return <div className="mt-2.5 flex gap-2">{children}</div>;
}

type PropsLista = { persona: string | null; editable: boolean; alCerrar: () => void };

/** El resto de una lista larga va a la Rutina: la tarjeta no reemplaza esa pantalla. */
function PieLista({ ocultos, editable, alCerrar }: { ocultos: number; editable: boolean; alCerrar: () => void }) {
  return (
    <>
      {ocultos > 0 && <div className="mt-1.5 text-[12.5px] font-semibold text-subtle">y {ocultos} más</div>}
      {editable && <EnlaceTarjeta alCerrar={alCerrar} href="/app/rutina" texto="Ver rutina" />}
    </>
  );
}

const BASE_LISTA = "ml-9 w-[82%] rounded-[20px] rounded-bl-[6px] bg-card p-3.5 shadow-card";
const FILA_LISTA = "flex items-baseline gap-2.5 border-t border-line-soft py-[7px] first:border-t-0";

function FilaConfirmada({ texto, detalle }: { texto: string; detalle?: string }) {
  return (
    <div className={cn(BASE_LISTA, "flex items-center gap-2.5 py-3")}>
      <IconoTomada />
      <span className="min-w-0 flex-1 break-words text-[13.5px] font-bold">{texto}</span>
      {detalle && <span className="shrink-0 text-[12.5px] font-semibold text-slate-brand">{detalle}</span>}
    </div>
  );
}

const TITULO_GRUPO: Record<string, (n: number, persona: string | null) => string> = {
  medication_added: (n, p) => `${n} medicamentos agregados${p ? ` a ${p}` : ""}`,
  appointment_added: (n, p) => `${n} turnos agendados${p ? ` para ${p}` : ""}`,
  medication_taken: (n, p) => `${n} tomas anotadas${p ? ` a ${p}` : ""}`,
};

function lineaDeGrupo(t: Tarjeta): { titulo: string; detalle: string } {
  const texto = (v: unknown) => (typeof v === "string" && v ? v : null);
  if (t.type === "appointment_added") {
    return { titulo: texto(t.specialty) ?? "Turno", detalle: [texto(t.date) && fechaTurnoEnPalabras(String(t.date)), texto(t.time)?.slice(0, 5)].filter(Boolean).join(" · ") };
  }
  if (t.type === "medication_taken") return { titulo: texto(t.medication_name) ?? "Remedio", detalle: texto(t.time) ?? "" };
  return { titulo: [texto(t.name), texto(t.dose)].filter(Boolean).join(" "), detalle: texto(t.time)?.slice(0, 5) ?? "" };
}

function TarjetaGrupo({ grupo, esPropio, alCerrar }: { grupo: Extract<TarjetaAgrupada, { type: "grupo" }>; esPropio: boolean; alCerrar: () => void }) {
  const icono = grupo.tipo === "appointment_added" ? "stethoscope" : grupo.tipo === "medication_taken" ? "check" : "pill";
  return (
    <div className={BASE_LISTA}>
      <CabeceraTarjeta icon={icono} texto={TITULO_GRUPO[grupo.tipo](grupo.items.length, grupo.persona)} />
      <ul className="mt-1.5">
        {grupo.items.map((t, i) => {
          const { titulo, detalle } = lineaDeGrupo(t);
          return (
            <li key={i} className={cn(FILA_LISTA, grupo.tipo === "appointment_added" ? "flex-col gap-0.5" : "justify-between")}>
              <span className="min-w-0 break-words text-[13.5px] font-bold">{titulo}</span>
              <span className={cn("text-[12.5px] font-semibold tabular-nums text-slate-brand", grupo.tipo !== "appointment_added" && "shrink-0 text-right")}>{detalle}</span>
            </li>
          );
        })}
      </ul>
      {esPropio && !grupo.persona && <EnlaceTarjeta alCerrar={alCerrar} href="/app/rutina" texto="Ver en Rutina" />}
    </div>
  );
}

function TarjetaHoy({ items, persona, editable, alCerrar, guardadoEn }: PropsLista & { items: ItemHoy[] | null; guardadoEn?: string }) {
  const base = guardadoEn ? tituloHoyGuardado(guardadoEn) : "Hoy";
  const titulo = persona ? `${base} · ${persona}` : base;
  if (!items) return <TarjetaSinLista titulo={titulo} editable={editable} alCerrar={alCerrar} />;
  const tomadas = items.filter((i) => i.tomado).length;
  const visibles = items.slice(0, REMEDIOS_TARJETA_VISIBLES);
  return (
    <div className={BASE_LISTA}>
      <CabeceraTarjeta icon="pill" texto={items.length ? `${titulo} · ${tomadas} de ${items.length} tomadas` : titulo} />
      {items.length === 0 ? (
        <div className="mt-2 text-[13.5px] font-medium text-subtle">No hay remedios para hoy.</div>
      ) : (
        <ul className="mt-1.5">
          {visibles.map((i, n) => (
            <li key={`${i.hora}-${i.nombre}-${n}`} className={FILA_LISTA}>
              <span className="w-[42px] shrink-0 text-[12.5px] font-bold tabular-nums text-slate-brand">{i.hora}</span>
              <span className={cn("min-w-0 flex-1 break-words text-[13.5px] font-bold", i.tomado && "text-subtle")}>
                {i.nombre}
                {i.dosis && <span className="font-medium text-subtle"> {i.dosis}</span>}
              </span>
              {i.tomado ? (
                <span className="flex shrink-0 items-center gap-1 text-[12px] font-bold text-teal-deep">
                  <VitaIcon name="check" size={13} strokeWidth={2.8} />
                  Tomada
                </span>
              ) : (
                <span className="shrink-0 text-[12px] font-semibold text-subtle">Pendiente</span>
              )}
            </li>
          ))}
        </ul>
      )}
      <PieLista ocultos={items.length - visibles.length} editable={editable} alCerrar={alCerrar} />
    </div>
  );
}

function TarjetaRemedios({ items, persona, editable, alCerrar }: PropsLista & { items: ItemRemedio[] | null }) {
  const titulo = persona ? `Remedios de ${persona}` : "Tus remedios";
  if (!items) return <TarjetaSinLista titulo={titulo} editable={editable} alCerrar={alCerrar} />;
  const visibles = items.slice(0, REMEDIOS_TARJETA_VISIBLES);
  return (
    <div className={BASE_LISTA}>
      <CabeceraTarjeta icon="pill" texto={items.length ? `${titulo} · ${items.length}` : titulo} />
      {items.length === 0 ? (
        <div className="mt-2 text-[13.5px] font-medium text-subtle">Todavía no hay remedios cargados.</div>
      ) : (
        <ul className="mt-1.5">
          {visibles.map((i, n) => (
            <li key={`${i.nombre}-${n}`} className={cn(FILA_LISTA, "justify-between")}>
              <span className="min-w-0 break-words text-[13.5px] font-bold">
                {i.nombre}
                {i.dosis && <span className="font-medium text-subtle"> {i.dosis}</span>}
              </span>
              <span className="shrink-0 text-right text-[12.5px] font-semibold tabular-nums text-slate-brand">{i.horas.join(" · ")}</span>
            </li>
          ))}
        </ul>
      )}
      <PieLista ocultos={items.length - visibles.length} editable={editable} alCerrar={alCerrar} />
    </div>
  );
}

function TarjetaSinLista({ titulo, editable, alCerrar }: { titulo: string; editable: boolean; alCerrar: () => void }) {
  return (
    <div className={cn(BASE_LISTA, "flex items-center justify-between gap-3 py-3")}>
      <span className="text-[13.5px] font-medium text-subtle">{titulo}</span>
      {editable && <EnlaceTarjeta alCerrar={alCerrar} href="/app/rutina" texto="Ver rutina" inline />}
    </div>
  );
}

function CabeceraTarjeta({ icon, texto }: { icon: string; texto: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex size-7 items-center justify-center rounded-full bg-persona-1-tint text-persona-1-deep">
        <VitaIcon name={icon} size={15} />
      </div>
      <div className="font-heading text-[13px] font-bold">{texto}</div>
    </div>
  );
}

function EnlaceTarjeta({
  href,
  texto,
  inline,
  primario,
  grupo,
  alCerrar,
}: {
  href: string;
  texto: string;
  inline?: boolean;
  primario?: boolean;
  /** Dentro de una fila de botones: reparten el ancho. */
  grupo?: boolean;
  alCerrar: () => void;
}) {
  // El chat es un overlay fijo encima de la app: navegar sin cerrarlo deja
  // la pantalla nueva tapada. Se cierra y se navega.
  return (
    <Link
      href={href}
      onClick={alCerrar}
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full py-2 font-heading text-[12.5px] font-bold",
        grupo ? "flex-1 justify-center px-2.5" : "px-3.5",
        primario ? "bg-primary text-primary-foreground" : "bg-secondary text-teal-deep",
        !inline && !grupo && "mt-2.5"
      )}
    >
      {texto}
      <VitaIcon name="chevron-right" size={13} />
    </Link>
  );
}
