import { VitaIcon } from "@/lib/vita-icons";
import { VitaAvatar } from "@/components/vita/v-mark";
import type { EstadoAvatar } from "@/components/vita/estados-avatar";
import { cn } from "@/lib/utils";
import { horaCorta } from "@/lib/notificaciones/mensajes";
import type { MomentoDia } from "@/lib/medicamentos/tipos";
import type { MedicionSimple, TurnoSimple } from "@/lib/modo-simple/tipos";

export type { MedicionSimple, TurnoSimple };

// Piezas PRESENTACIONALES del modo simple (sin hooks de datos): las usa la
// pantalla real (`pantalla.tsx`) y la vista previa de Configurar modo simple
// (`/app/familia/[id]/modo-simple`), así lo que se ve en la vista previa es lo
// mismo que ve la persona.

export type Dosis = {
  id: string;
  nombre: string;
  dosis: string | null;
  unidad: string;
  horaProgramada: string;
};

export type Siguiente = { id: string; nombre: string; horaProgramada: string; momento: MomentoDia };

const UNIDAD_HABLADA: Record<string, string> = {
  mg: "miligramos",
  ml: "mililitros",
  gotas: "gotas",
  UI: "unidades",
  "comp.": "comprimidos",
};

export const DEL_MOMENTO: Record<MomentoDia, string> = {
  "mañana": "de la mañana",
  mediodia: "del mediodía",
  tarde: "de la tarde",
  noche: "de la noche",
};

const ICONO_MOMENTO: Record<MomentoDia, string> = {
  "mañana": "sunrise",
  mediodia: "sun",
  tarde: "sunset",
  noche: "moon",
};

export function listaHablada(nombres: string[]): string {
  if (nombres.length <= 1) return nombres[0] ?? "";
  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

export function fraseAnuncio(grupo: Dosis[], momento: MomentoDia | null): string {
  if (grupo.length === 1) {
    const p = grupo[0];
    const unidadTexto = UNIDAD_HABLADA[p.unidad] ?? p.unidad;
    const dosisTexto = p.dosis ? `, ${p.dosis} ${unidadTexto}` : "";
    return `Es hora de tomar ${p.nombre}${dosisTexto}.`;
  }
  const cuando = momento ? ` ${DEL_MOMENTO[momento]}` : "";
  return `Es hora de tomar tus ${grupo.length} pastillas${cuando}: ${listaHablada(grupo.map((p) => p.nombre))}.`;
}

export function tituloGrupo(n: number, momento: MomentoDia | null): string {
  const cuando = momento ? ` ${DEL_MOMENTO[momento]}` : "";
  return n === 1 ? `Tu pastilla${cuando}` : `Tus ${n} pastillas${cuando}`;
}


// Encabezado V7: fecha + "Buen día, {nombre}" y el botón rojo "Ayuda". Con
// contacto de emergencia cargado es un link `tel:` (llama directo); sin él
// abre una hoja que explica dónde cargarlo.
export function Cabecera({
  saludo,
  nombre,
  fechaTexto,
  telefono,
  contacto,
  onAyuda,
  conAyuda = true,
}: {
  saludo: string;
  nombre: string;
  fechaTexto: string;
  telefono: string | null;
  contacto: string | null;
  onAyuda: () => void;
  /** Configurar modo simple puede ocultar el botón rojo. */
  conAyuda?: boolean;
}) {
  const clasesAyuda =
    "flex h-[58px] shrink-0 items-center gap-2 rounded-full bg-destructive px-5 text-[19px] font-extrabold text-primary-foreground shadow-[0_8px_20px_color-mix(in_srgb,var(--destructive)_32%,transparent)] transition-transform active:scale-[0.96] motion-reduce:transition-none";
  const telLimpio = telefono?.replace(/[^\d+]/g, "");

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-[17px] font-semibold text-slate-brand first-letter:uppercase">{fechaTexto}</div>
        <h1 className="mt-1 font-heading text-[36px] font-extrabold leading-[1.05] tracking-[-0.04em]">
          {saludo}
          {nombre ? "," : ""}
          {nombre && (
            <>
              <br />
              {nombre}
            </>
          )}
        </h1>
      </div>
      {!conAyuda ? null : telLimpio ? (
        <a href={`tel:${telLimpio}`} aria-label={contacto ? `Pedir ayuda: llamar a ${contacto}` : "Pedir ayuda: llamar a tu contacto de emergencia"} className={clasesAyuda}>
          <VitaIcon name="alert-triangle" size={24} strokeWidth={2.4} />
          Ayuda
        </a>
      ) : (
        <button type="button" onClick={onAyuda} className={clasesAyuda}>
          <VitaIcon name="alert-triangle" size={24} strokeWidth={2.4} />
          Ayuda
        </button>
      )}
    </div>
  );
}

function BotonEscuchar({ onEscuchar }: { onEscuchar: () => void }) {
  return (
    <button
      type="button"
      onClick={onEscuchar}
      className="flex shrink-0 flex-col items-center gap-0.5 rounded-[var(--radius-item)] bg-persona-1-tint px-3.5 py-2.5 text-teal-deep transition-transform active:scale-[0.96] motion-reduce:transition-none"
    >
      <VitaIcon name="volume" size={26} strokeWidth={2.2} />
      <span className="text-[14px] font-extrabold">Escuchar</span>
    </button>
  );
}

// Slot de la foto de la pastilla — todavía no hay dónde guardarla, así que es
// un placeholder (ícono) con el borde punteado del diseño.
function SlotFoto() {
  return (
    <div
      aria-hidden
      className="flex size-[84px] shrink-0 items-center justify-center rounded-[var(--radius-item)] border border-dashed border-faint bg-secondary text-faint"
    >
      <VitaIcon name="pill" size={30} />
    </div>
  );
}

export function TarjetaGrupo({
  grupo,
  momento,
  alertado,
  faltanMinutos,
  confirmando,
  escuchandoVoz,
  silenciada,
  conVoz = true,
  puedePosponer = true,
  minutosPosponer = 15,
  onConfirmar,
  onEscuchar,
  onPosponer,
  onAlternarVoz,
}: {
  grupo: Dosis[];
  momento: MomentoDia | null;
  alertado: boolean;
  faltanMinutos: number;
  confirmando: boolean;
  escuchandoVoz: boolean;
  silenciada: boolean;
  /** "Leerle los avisos" de Configurar modo simple. */
  conVoz?: boolean;
  puedePosponer?: boolean;
  minutosPosponer?: number;
  onConfirmar: () => void;
  onEscuchar: () => void;
  onPosponer: () => void;
  onAlternarVoz: () => void;
}) {
  const n = grupo.length;
  return (
    <div className="rounded-[28px] bg-card p-5 shadow-card">
      {alertado ? (
        <div className="eyebrow mb-1.5 flex items-center gap-1.5 text-aviso-ink">
          <VitaIcon name="alert-triangle" size={14} strokeWidth={2.6} /> Todavía no confirmaste
        </div>
      ) : (
        faltanMinutos > 0 && <div className="eyebrow mb-1.5 text-subtle">En {faltanMinutos} min</div>
      )}
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-heading text-[28px] font-extrabold leading-[1.1] tracking-[-0.035em] text-balance">
          {tituloGrupo(n, momento)}
        </h2>
        {!silenciada && conVoz && <BotonEscuchar onEscuchar={onEscuchar} />}
      </div>

      <ul className="mt-4 flex flex-col gap-3">
        {grupo.map((m) => (
          <li key={m.id} className="flex items-center gap-4">
            <SlotFoto />
            <div className="min-w-0">
              <div className="font-heading text-[26px] font-extrabold leading-tight tracking-[-0.03em]">{m.nombre}</div>
              <div className="mt-0.5 text-[15px] font-semibold text-subtle">
                {[m.dosis && `${m.dosis} ${m.unidad}`, `${horaCorta(m.horaProgramada)} hs`].filter(Boolean).join(" · ")}
              </div>
            </div>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={onConfirmar}
        disabled={confirmando}
        className="mt-5 flex h-[76px] w-full items-center justify-center gap-3 rounded-full bg-teal-deep text-[24px] font-extrabold text-primary-foreground shadow-[0_14px_28px_color-mix(in_srgb,var(--teal-deep)_32%,transparent)] transition-transform active:scale-[0.98] disabled:opacity-70 motion-reduce:transition-none"
      >
        <VitaIcon name="check" size={32} strokeWidth={3} />
        {n === 1 ? "Ya la tomé" : `Ya tomé las ${n}`}
      </button>
      {puedePosponer && (
        <button
          type="button"
          onClick={onPosponer}
          disabled={confirmando}
          className="mt-3 flex h-[64px] w-full items-center justify-center gap-2.5 rounded-full border-2 border-foreground/10 bg-card text-[19px] font-extrabold transition-transform active:scale-[0.98] disabled:opacity-70 motion-reduce:transition-none"
        >
          <VitaIcon name="clock" size={24} strokeWidth={2.4} />
          Más tarde · en {minutosPosponer} min
        </button>
      )}
      {!silenciada && (
        <button
          type="button"
          onClick={onAlternarVoz}
          className={cn(
            "mt-3 flex h-[56px] w-full items-center justify-center gap-2 rounded-full text-[16px] font-bold text-teal-deep",
            escuchandoVoz ? "bg-persona-1-tint" : "bg-secondary"
          )}
        >
          <VitaIcon name="mic" size={19} />
          {escuchandoVoz ? "Escuchando…" : "Tocá y decí \"sí\""}
        </button>
      )}
    </div>
  );
}


export function TarjetaSiguientes({ siguientes }: { siguientes: Siguiente[] }) {
  return (
    <section>
      <h2 className="eyebrow px-1 pb-2 text-subtle">Después</h2>
      <ul className="overflow-hidden rounded-[var(--radius-card)] bg-card shadow-card">
        {siguientes.map((s) => (
          <li key={s.id} className="flex items-center gap-3.5 px-4 py-3.5 [&:not(:first-child)]:border-t [&:not(:first-child)]:border-foreground/[0.06]">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-[var(--radius-tile)] bg-persona-1-tint text-teal-deep">
              <VitaIcon name={ICONO_MOMENTO[s.momento]} size={24} />
            </div>
            <div className="min-w-0">
              <div className="font-heading text-[19px] font-extrabold tracking-[-0.025em]">{s.nombre}</div>
              <div className="text-[14px] font-semibold text-subtle">
                A las {horaCorta(s.horaProgramada)} {DEL_MOMENTO[s.momento]}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function TarjetaDescanso({ nombre, hayMedsHoy }: { nombre: string; hayMedsHoy: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[28px] bg-card px-6 py-9 text-center shadow-card">
      <div className="flex size-20 items-center justify-center rounded-full bg-persona-1-tint text-teal-deep">
        <VitaIcon name="check" size={40} strokeWidth={3} />
      </div>
      <div className="font-heading text-[26px] font-extrabold leading-tight tracking-[-0.035em]">
        {hayMedsHoy ? `Tomaste todo hoy${nombre ? `, ${nombre}` : ""}` : "Hoy no tenés medicación pendiente"}
      </div>
      <div className="text-[16px] font-medium text-subtle">Te vamos a avisar cuando sea la hora.</div>
    </div>
  );
}


// Barra inferior V7: "Ajustes" a la izquierda y, al centro, "Hablar con Vita"
// con la mascota (abre el chat, que ya tiene el modo voz).
export function BarraInferior({
  estado,
  onHablar,
  onAjustes,
  conCharla = true,
}: {
  estado: EstadoAvatar;
  onHablar: () => void;
  onAjustes: () => void;
  /** "Hablar con Vita" de Configurar modo simple. */
  conCharla?: boolean;
}) {
  return (
    <div
      className="absolute inset-x-3 bottom-0 z-10"
      style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
    >
      <div className="relative flex h-[88px] items-end justify-between rounded-[28px] bg-card px-5 pb-3 shadow-nav">
        <button
          type="button"
          onClick={onAjustes}
          className="flex flex-col items-center gap-1 transition-transform active:scale-[0.95] motion-reduce:transition-none"
        >
          <span className="flex size-11 items-center justify-center rounded-full bg-secondary text-slate-brand">
            <VitaIcon name="settings" size={24} />
          </span>
          <span className="text-[13px] font-extrabold text-slate-brand">Ajustes</span>
        </button>
        {conCharla && (
        <button
          type="button"
          onClick={onHablar}
          className="absolute left-1/2 top-[-34px] flex -translate-x-1/2 flex-col items-center gap-1 transition-transform active:scale-[0.95] motion-reduce:transition-none"
        >
          <span className="flex size-[76px] items-center justify-center overflow-hidden rounded-full bg-card shadow-nav ring-[3px] ring-primary">
            <VitaAvatar size={64} estado={estado} interactivo={false} />
          </span>
          <span className="whitespace-nowrap font-heading text-[17px] font-extrabold tracking-[-0.02em]">Hablar con Vita</span>
        </button>
        )}
        <span className="w-11" aria-hidden />
      </div>
    </div>
  );
}


// ─── Turno (V7 "Hoy / Mañana tenés turno") ────────────────────────────────────


export function TarjetaTurno({ turno }: { turno: TurnoSimple }) {
  const destino = [turno.direccion, turno.lugar].filter(Boolean).join(", ");
  return (
    <section
      aria-label={turno.dia === "hoy" ? "Hoy tenés turno" : "Mañana tenés turno"}
      className="flex flex-col gap-3.5 rounded-[28px] border-2 border-persona-violeta-deep/20 bg-persona-violeta-tint p-5"
    >
      <div className="text-[20px] font-extrabold text-persona-violeta-deep">
        {turno.dia === "hoy" ? "Hoy tenés turno" : "Mañana tenés turno"}
      </div>
      <div>
        <div className="font-heading text-[30px] font-extrabold leading-[1.1] tracking-[-0.03em] text-balance">{turno.especialidad}</div>
        <div className="mt-1.5 text-[22px] font-semibold">{turno.palabras}</div>
        {(turno.profesional || turno.lugar) && (
          <div className="mt-1 text-[19px] font-medium text-slate-brand">
            {[turno.profesional, turno.lugar].filter(Boolean).join(" · ")}
          </div>
        )}
      </div>
      {turno.llevar.length > 0 && (
        <div>
          <div className="text-[17px] font-extrabold text-persona-violeta-deep">
            {turno.dia === "manana" ? "Dejá esto en la cartera" : "Qué llevar"}
          </div>
          <ul className="mt-2 flex flex-col gap-2">
            {turno.llevar.map((t) => (
              <li key={t} className="flex items-center gap-3.5 rounded-[18px] bg-card px-4 py-3.5">
                <span aria-hidden className="size-3 shrink-0 rounded-full bg-persona-violeta-deep" />
                <span className="text-[20px] font-extrabold leading-tight">{t}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {destino && (
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destino)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-[60px] items-center justify-center gap-3 rounded-[20px] bg-persona-violeta-deep text-[19px] font-extrabold text-primary-foreground transition-transform active:scale-[0.98] motion-reduce:transition-none"
        >
          <VitaIcon name="navigation" size={26} strokeWidth={2.4} />
          Cómo llegar
        </a>
      )}
    </section>
  );
}

// ─── Mediciones (V7 "Es hora de medirte la presión") ──────────────────────────


export function TarjetaMediciones({
  titulo,
  mediciones,
  hrefDe,
}: {
  titulo: string;
  mediciones: MedicionSimple[];
  /** null = no navega (vista previa). */
  hrefDe: ((tipo: MedicionSimple["tipo"]) => string) | null;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="px-1 font-heading text-[23px] font-extrabold tracking-[-0.02em] text-balance">{titulo}</h2>
      <div className="flex gap-3">
        {mediciones.map((m) => {
          const contenido = (
            <>
              <span
                aria-hidden
                className={cn(
                  "flex size-14 items-center justify-center rounded-[18px]",
                  m.tipo === "presion" ? "bg-destructive/10 text-destructive" : "bg-aviso-tint text-aviso-ink"
                )}
              >
                <VitaIcon name={m.tipo === "presion" ? "heart" : "droplet"} size={28} />
              </span>
              <span>
                <span className="block text-[21px] font-extrabold text-slate-brand">{m.nombre}</span>
                <span className="mt-1.5 flex flex-wrap items-baseline gap-1.5">
                  <span className="font-heading text-[36px] font-extrabold leading-none tracking-[-0.04em] tabular-nums">{m.valor}</span>
                  <span className="text-[15px] font-bold text-slate-brand">{m.unidad}</span>
                </span>
                <span className={cn("mt-1.5 block text-pretty text-[17px] font-semibold leading-[1.3]", m.pendiente ? "text-aviso-ink" : "text-teal-deep")}>
                  {m.pendiente ? `${m.cuando} · falta medir hoy` : m.cuando}
                </span>
              </span>
            </>
          );
          const clases = "flex min-w-0 flex-1 flex-col gap-3 rounded-[26px] border-2 border-foreground/[0.08] bg-card px-4 py-[18px] text-left";
          return hrefDe ? (
            <a key={m.tipo} href={hrefDe(m.tipo)} className={cn(clases, "transition-colors active:bg-secondary")}>
              {contenido}
            </a>
          ) : (
            <div key={m.tipo} className={clases}>
              {contenido}
            </div>
          );
        })}
      </div>
    </section>
  );
}
