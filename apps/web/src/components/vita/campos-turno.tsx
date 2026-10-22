"use client";

import { useState } from "react";
import { VitaIcon } from "@/lib/vita-icons";
import { cn } from "@/lib/utils";
import { fechaConOffset } from "@/lib/rutina/formato";
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
