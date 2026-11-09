"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { VitaIcon } from "@/lib/vita-icons";
import { cn } from "@/lib/utils";
import { fechaConOffset } from "@/lib/rutina/formato";
import { celdasDelMes, etiquetaDiaTurno, pasoHora, pasoMinutos, sugerirEspecialidades, tituloMes } from "@/lib/turnos/alta";
import { ESPECIALIDADES_ALTA } from "@/lib/turnos/tipos";
import { iconoDeEspecialidad } from "@/lib/turnos/icono";

// Piezas compartidas del alta y la edición de turnos (V7 D:2205): pills de
// especialidad con ícono, franja de días y la barra lateral de aviso.

const PILL_ON = "bg-ink text-background";
const PILL_OFF = "bg-card text-slate-brand shadow-item";

export function EtiquetaSeccion({ text }: { text: string }) {
  return <div className="eyebrow border-b border-foreground/[0.07] pb-2.5 text-subtle">{text}</div>;
}

export function PillsEspecialidad({ valor, onCambio }: { valor: string; onCambio: (v: string) => void }) {
  const esLista = (ESPECIALIDADES_ALTA as readonly string[]).includes(valor);
  // "Otra" queda activa aunque el texto todavía esté vacío.
  const [otra, setOtra] = useState(valor !== "" && !esLista);
  const otraActiva = otra || (valor !== "" && !esLista);

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {ESPECIALIDADES_ALTA.map((e) => {
          const sel = !otraActiva && valor === e;
          return (
            <button
              key={e}
              type="button"
              onClick={() => {
                setOtra(false);
                onCambio(e);
              }}
              aria-pressed={sel}
              className={cn(
                "inline-flex items-center gap-[7px] rounded-full px-4 py-[11px] text-[13.5px] font-bold transition-all motion-reduce:transition-none",
                sel ? PILL_ON : PILL_OFF
              )}
            >
              <VitaIcon name={iconoDeEspecialidad(e)} size={16} color={sel ? "var(--background)" : "var(--teal-deep)"} />
              {e}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => {
            setOtra(true);
            if (esLista) onCambio("");
          }}
          aria-pressed={otraActiva}
          className={cn(
            "inline-flex items-center gap-[7px] rounded-full px-4 py-[11px] text-[13.5px] font-bold transition-all motion-reduce:transition-none",
            otraActiva ? PILL_ON : PILL_OFF
          )}
        >
          <VitaIcon name="plus" size={16} color={otraActiva ? "var(--background)" : "var(--teal-deep)"} />
          Otra
        </button>
      </div>
      {otraActiva && (
        <input
          value={esLista ? "" : valor}
          onChange={(e) => onCambio(e.target.value)}
          placeholder="¿Qué especialidad?"
          aria-label="Especialidad"
          autoFocus
          className="mt-2.5 w-full rounded-full bg-card px-[18px] py-3.5 text-[14.5px] font-semibold shadow-item outline-none placeholder:font-medium placeholder:text-faint focus-visible:ring-2 focus-visible:ring-primary/40"
        />
      )}
    </div>
  );
}

function diaDeLaSemana(fechaISO: string): string {
  return new Intl.DateTimeFormat("es-AR", { weekday: "short", timeZone: "UTC" })
    .format(new Date(`${fechaISO}T12:00:00Z`))
    .replace(".", "")
    .slice(0, 3);
}

/** Franja de días (D:2237): los próximos 14 desde hoy; si el valor cae fuera, se antepone. */
export function FranjaDias({ valor, onCambio, dias = 14 }: { valor: string; onCambio: (fecha: string) => void; dias?: number }) {
  const fechas = Array.from({ length: dias }, (_, i) => fechaConOffset(i));
  if (valor && !fechas.includes(valor)) fechas.unshift(valor);
  return (
    <div className="-mx-[18px] flex gap-2 overflow-x-auto px-[18px] pb-1 [scrollbar-width:none]">
      {fechas.map((f) => {
        const sel = f === valor;
        return (
          <button
            key={f}
            type="button"
            onClick={() => onCambio(f)}
            aria-pressed={sel}
            className={cn(
              "w-[62px] shrink-0 rounded-[var(--radius-item)] py-3 transition-all motion-reduce:transition-none",
              sel ? PILL_ON : PILL_OFF
            )}
          >
            <div className="eyebrow opacity-65">{diaDeLaSemana(f)}</div>
            <div className="mt-[3px] font-heading text-[19px] font-extrabold tabular-nums tracking-[-0.02em]">{Number(f.slice(8, 10))}</div>
          </button>
        );
      })}
    </div>
  );
}

export function NotaLateral({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 flex items-start gap-[11px]">
      <div aria-hidden className="min-h-[34px] w-[3px] self-stretch rounded bg-primary" />
      <div className="text-[12.5px] font-medium leading-normal text-slate-brand">{children}</div>
    </div>
  );
}

/** Especialidad en texto libre, con sugerencias mientras se escribe y las ya usadas (V7). */
export function CampoEspecialidad({ valor, onCambio, usadas }: { valor: string; onCambio: (v: string) => void; usadas: string[] }) {
  const [elegida, setElegida] = useState(false);
  const sugerencias = elegida ? [] : sugerirEspecialidades(valor);
  const recientes = usadas.filter((u) => u !== valor).slice(0, 4);

  function elegir(especialidad: string) {
    setElegida(true);
    onCambio(especialidad);
  }

  return (
    <div>
      <div className="flex items-center gap-3 rounded-full bg-card py-1 pl-[18px] pr-1.5 shadow-item">
        <VitaIcon name="stethoscope" size={18} className="shrink-0 text-subtle" />
        <input
          value={valor}
          onChange={(e) => {
            setElegida(false);
            onCambio(e.target.value);
          }}
          placeholder="¿De qué es el turno?"
          aria-label="Especialidad"
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent py-[11px] text-[15.5px] font-semibold outline-none placeholder:font-medium placeholder:text-faint"
        />
        {valor && (
          <button
            type="button"
            onClick={() => {
              setElegida(false);
              onCambio("");
            }}
            aria-label="Borrar especialidad"
            className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-secondary text-subtle"
          >
            <VitaIcon name="close" size={12} strokeWidth={3} />
          </button>
        )}
      </div>
      {sugerencias.length > 0 && (
        <div className="mt-2 overflow-hidden rounded-[var(--radius-item)] bg-card shadow-item">
          {sugerencias.map((s, i) => (
            <button
              key={s.etiqueta}
              type="button"
              onClick={() => elegir(s.etiqueta)}
              className={cn("flex w-full items-center gap-3 px-4 py-3 text-left", i > 0 && "border-t border-foreground/[0.06]")}
            >
              <VitaIcon name={iconoDeEspecialidad(s.etiqueta)} size={16} color="var(--teal-deep)" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold">{s.etiqueta}</span>
                {s.por && <span className="block text-[11.5px] font-medium text-subtle">Por “{s.por}”</span>}
              </span>
            </button>
          ))}
        </div>
      )}
      {sugerencias.length === 0 && recientes.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-[7px]">
          <span className="shrink-0 text-xs font-bold text-subtle">Usadas antes</span>
          {recientes.map((r) => (
            <button key={r} type="button" onClick={() => elegir(r)} className="rounded-full bg-card px-3 py-[7px] text-[12.5px] font-bold text-slate-brand shadow-item">
              {r}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** "Día del turno" con calendario mensual desplegable; no deja elegir días pasados (V7). */
export function CalendarioTurno({ valor, onCambio }: { valor: string; onCambio: (fecha: string) => void }) {
  const hoy = fechaConOffset(0);
  const base = valor || hoy;
  const [abierto, setAbierto] = useState(false);
  const [cursor, setCursor] = useState({ anio: Number(base.slice(0, 4)), mes: Number(base.slice(5, 7)) - 1 });
  const esMesActual = cursor.anio === Number(hoy.slice(0, 4)) && cursor.mes === Number(hoy.slice(5, 7)) - 1;

  function mover(delta: 1 | -1) {
    setCursor((c) => {
      const d = new Date(Date.UTC(c.anio, c.mes + delta, 1));
      return { anio: d.getUTCFullYear(), mes: d.getUTCMonth() };
    });
  }

  return (
    <div className="rounded-[var(--radius-item)] bg-card shadow-item">
      <button type="button" onClick={() => setAbierto((a) => !a)} aria-expanded={abierto} className="flex w-full items-center gap-3 px-[18px] py-[15px] text-left">
        <VitaIcon name="calendar" size={17} className="shrink-0 text-subtle" />
        <span className="eyebrow min-w-0 flex-1 text-subtle">Día del turno</span>
        <span className={cn("font-heading text-[14.5px] font-extrabold tracking-[-0.02em]", !valor && "text-teal-deep")}>{valor ? etiquetaDiaTurno(valor) : "Elegir"}</span>
      </button>
      {abierto && (
        <div className="border-t border-foreground/[0.06] px-3.5 pb-3.5 pt-3">
          <div className="flex items-center justify-between">
            <button type="button" disabled={esMesActual} onClick={() => mover(-1)} aria-label="Mes anterior" className="flex size-8 items-center justify-center rounded-full disabled:opacity-30">
              <VitaIcon name="chevron-left" size={16} />
            </button>
            <div className="font-heading text-sm font-extrabold">{tituloMes(cursor.anio, cursor.mes)}</div>
            <button type="button" onClick={() => mover(1)} aria-label="Mes siguiente" className="flex size-8 items-center justify-center rounded-full">
              <VitaIcon name="chevron-right" size={16} />
            </button>
          </div>
          <div className="mt-2 grid grid-cols-7 gap-y-1 text-center">
            {["L", "M", "X", "J", "V", "S", "D"].map((d, i) => (
              <div key={i} className="py-1 text-[11px] font-bold text-subtle">{d}</div>
            ))}
            {celdasDelMes(cursor.anio, cursor.mes).map((f, i) => {
              if (!f) return <div key={i} />;
              const pasado = f < hoy;
              const sel = f === valor;
              return (
                <button
                  key={f}
                  type="button"
                  disabled={pasado}
                  aria-pressed={sel}
                  aria-label={etiquetaDiaTurno(f)}
                  onClick={() => {
                    onCambio(f);
                    setAbierto(false);
                  }}
                  className={cn(
                    "mx-auto flex size-9 items-center justify-center rounded-full text-[13.5px] font-bold disabled:opacity-30",
                    sel ? "bg-primary text-primary-foreground" : f === hoy && "bg-secondary"
                  )}
                >
                  {Number(f.slice(8, 10))}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/** Selector de hora del turno: horas y minutos por separado, sin momentos del día (V7). */
export function SelectorHoraTurno({ abierto, hora, onCerrar, onConfirmar }: { abierto: boolean; hora: string; onCerrar: () => void; onConfirmar: (hora: string) => void }) {
  return (
    <Sheet open={abierto} onOpenChange={(v) => !v && onCerrar()}>
      <SheetContent side="bottom" showCloseButton={false} className="max-h-[92%] gap-0 overflow-y-auto rounded-t-[28px] bg-card px-5 pb-[34px] pt-3.5 [scrollbar-width:none]">
        <div aria-hidden className="mx-auto mb-[18px] h-1 w-10 shrink-0 rounded bg-line" />
        <ContenidoHoraTurno hora={hora} onConfirmar={onConfirmar} />
      </SheetContent>
    </Sheet>
  );
}

function ContenidoHoraTurno({ hora, onConfirmar }: { hora: string; onConfirmar: (hora: string) => void }) {
  const [h, setH] = useState(Number(hora.slice(0, 2)));
  const [m, setM] = useState(Number(hora.slice(3, 5)));
  const dos = (n: number) => String(n).padStart(2, "0");

  return (
    <>
      <SheetTitle className="font-heading text-[21px] font-extrabold tracking-[-0.02em]">¿A qué hora?</SheetTitle>
      <SheetDescription className="sr-only">Elegí la hora y los minutos del turno</SheetDescription>
      <div className="eyebrow mb-2.5 mt-[18px] text-subtle">Hora</div>
      <div className="flex items-center gap-2">
        <Paso valor={dos(h)} etiqueta="hora" onMenos={() => setH((x) => pasoHora(x, -1))} onMas={() => setH((x) => pasoHora(x, 1))} />
        <div aria-hidden className="font-heading text-[26px] font-bold">:</div>
        <Paso valor={dos(m)} etiqueta="minutos" onMenos={() => setM((x) => pasoMinutos(x, -1))} onMas={() => setM((x) => pasoMinutos(x, 1))} />
      </div>
      <button
        type="button"
        onClick={() => onConfirmar(`${dos(h)}:${dos(m)}`)}
        className="mt-5 w-full rounded-full bg-primary py-[17px] font-heading text-[15px] font-extrabold tracking-[-0.01em] text-primary-foreground active:scale-[0.98] motion-reduce:transform-none"
      >
        Confirmar
      </button>
    </>
  );
}

function Paso({ valor, etiqueta, onMenos, onMas }: { valor: string; etiqueta: string; onMenos: () => void; onMas: () => void }) {
  const boton = "h-[60px] w-11 shrink-0 rounded-[var(--radius-item)] bg-canvas text-[22px] font-bold text-slate-brand active:scale-95 motion-reduce:transform-none";
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5">
      <button type="button" onClick={onMenos} aria-label={`Menos ${etiqueta}`} className={boton}>−</button>
      <div aria-live="polite" className="flex h-[60px] min-w-0 flex-1 items-center justify-center rounded-[var(--radius-item)] bg-canvas font-heading text-[26px] font-bold tabular-nums">{valor}</div>
      <button type="button" onClick={onMas} aria-label={`Más ${etiqueta}`} className={boton}>+</button>
    </div>
  );
}
