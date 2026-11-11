"use client";

import { indicacionesDelMomento, MOMENTOS_SELECTOR, SIN_COMIDA, type ComidaToma } from "@/lib/medicamentos/comidas";
import type { MomentoDia } from "@/lib/medicamentos/tipos";
import { moverHora } from "@/lib/rutina/momento";
import { cn } from "@/lib/utils";

// Piezas del "¿A qué hora?": momento del día, hora con − / + y comidas del
// momento. Una sola copia para toda la app: la hoja SelectorHora (alta y
// edición de medicamentos, planes de medición, turnos) y la tarjeta de horas
// de la charla inicial. `compacto` = la versión chica que va dentro de una
// tarjeta (fondo de los botones gris en vez de blanco con sombra).

const PASO_MINUTOS = 30;

const CHIP_ON = "bg-ink text-background";
const chipOff = (compacto: boolean) => (compacto ? "bg-secondary text-slate-brand" : "bg-card text-slate-brand shadow-item");

/** Mañana / Mediodía / Tarde / Noche. */
export function ChipsMomento({
  momento,
  onElegir,
  compacto = false,
}: {
  momento: MomentoDia;
  /** Recibe el momento y su hora sugerida ("08:00" para la mañana). */
  onElegir: (momento: MomentoDia, horaSugerida: string) => void;
  compacto?: boolean;
}) {
  return (
    <div className={cn("flex", compacto ? "gap-1.5" : "gap-2")}>
      {MOMENTOS_SELECTOR.map((m) => (
        <button
          key={m.momento}
          type="button"
          aria-pressed={momento === m.momento}
          onClick={() => onElegir(m.momento, m.hora)}
          className={cn(
            "flex-1 font-bold transition-all motion-reduce:transition-none",
            compacto ? "rounded-[12px] py-2.5 text-[12px]" : "rounded-[14px] px-0.5 py-3 text-[12.5px]",
            momento === m.momento ? CHIP_ON : chipOff(compacto)
          )}
        >
          {m.etiqueta}
        </button>
      ))}
    </div>
  );
}

/** Hora "HH:MM" con − / + de a 30 minutos. */
export function PasoHora({
  hora,
  onCambio,
  compacto = false,
}: {
  hora: string;
  onCambio: (hora: string) => void;
  compacto?: boolean;
}) {
  const boton = cn(
    "rounded-[var(--radius-item)] text-2xl font-bold text-slate-brand transition-transform active:scale-95 motion-reduce:transition-none",
    compacto ? "h-[52px] w-12 bg-secondary" : "h-[60px] w-[52px] bg-canvas"
  );
  return (
    <div className={cn("flex items-center", compacto ? "gap-2" : "gap-2.5")}>
      <button type="button" onClick={() => onCambio(moverHora(hora, -PASO_MINUTOS))} aria-label="30 minutos menos" className={boton}>
        −
      </button>
      <div
        aria-live="polite"
        className={cn(
          "flex flex-1 items-center justify-center rounded-[var(--radius-item)] font-heading font-bold tabular-nums",
          compacto ? "h-[52px] bg-secondary text-[26px] tracking-[-0.03em]" : "h-[60px] bg-canvas text-[30px] tracking-[-0.04em]"
        )}
      >
        {hora}
      </div>
      <button type="button" onClick={() => onCambio(moverHora(hora, PASO_MINUTOS))} aria-label="30 minutos más" className={boton}>
        +
      </button>
    </div>
  );
}

/**
 * "Ninguna" + las comidas del momento elegido (la noche muestra solo las de la
 * cena y antes de dormir). Elegir una no mueve la hora: la hora la decide la
 * persona y la comida es una observación aparte.
 */
export function ChipsComida({
  momento,
  comida,
  onCambio,
}: {
  momento: MomentoDia;
  comida: ComidaToma;
  onCambio: (comida: ComidaToma) => void;
}) {
  const ninguna = comida.conComida === "no-importa" && !comida.indicacion;
  const clase = (activa: boolean) =>
    cn("rounded-full px-[13px] py-2.5 text-[12.5px] font-bold transition-all motion-reduce:transition-none", activa ? CHIP_ON : chipOff(false));
  return (
    <div className="flex flex-wrap gap-[7px]">
      <button type="button" aria-pressed={ninguna} onClick={() => onCambio(SIN_COMIDA)} className={clase(ninguna)}>
        Ninguna
      </button>
      {indicacionesDelMomento(momento).map((c) => (
        <button
          key={c.clave}
          type="button"
          aria-pressed={comida.indicacion === c.clave}
          onClick={() => onCambio({ conComida: c.conComida, indicacion: c.clave })}
          className={clase(comida.indicacion === c.clave)}
        >
          {c.etiqueta}
        </button>
      ))}
    </div>
  );
}
