"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { momentoDelDia } from "@/lib/rutina/momento";
import { COMIDAS_SELECTOR, MOMENTOS_SELECTOR, relacionDeToma } from "@/lib/medicamentos/comidas";
import type { ConComida, MomentoDia } from "@/lib/medicamentos/tipos";
import { cn } from "@/lib/utils";
import { VitaIcon } from "@/lib/vita-icons";

// Selector de hora (V7 D:3343, "¿A qué hora?"): momento del día, "Con las
// comidas" (solo para medicamentos), hora con − / + de 30 min y Confirmar.
// Se usa en el alta y en la edición de medicamentos y en el alta/edición de
// turnos. Devuelve la hora "HH:MM" y la relación con la comida elegida.

const CHIP_ON = "bg-ink text-background";
const CHIP_OFF = "bg-card text-slate-brand shadow-item";

function aMinutos(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function deMinutos(min: number): string {
  const n = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
}

export function SelectorHora({
  abierto,
  hora,
  conComida,
  conComidas,
  onConfirmar,
  onCerrar,
}: {
  abierto: boolean;
  hora: string;
  conComida?: ConComida;
  /** Muestra "Con las comidas" (medicamentos); los turnos lo ocultan. */
  conComidas: boolean;
  onConfirmar: (hora: string, conComida: ConComida) => void;
  onCerrar: () => void;
}) {
  return (
    <Sheet open={abierto} onOpenChange={(v) => !v && onCerrar()}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="max-h-[92%] gap-0 overflow-y-auto rounded-t-[28px] bg-card px-5 pb-[34px] pt-3.5 [scrollbar-width:none]"
      >
        <div aria-hidden className="mx-auto mb-[18px] h-1 w-10 shrink-0 rounded bg-line" />
        <Contenido
          hora={hora || "08:00"}
          conComida={conComida ?? "no-importa"}
          conComidas={conComidas}
          onConfirmar={onConfirmar}
        />
      </SheetContent>
    </Sheet>
  );
}

// Se monta al abrir la hoja: el estado nace de la hora/relación con que se abrió.
function Contenido({
  hora: horaInicial,
  conComida: comidaInicial,
  conComidas,
  onConfirmar,
}: {
  hora: string;
  conComida: ConComida;
  conComidas: boolean;
  onConfirmar: (hora: string, conComida: ConComida) => void;
}) {
  const [hora, setHora] = useState(horaInicial);
  const [comida, setComida] = useState<ConComida>(comidaInicial);
  const momento: MomentoDia = momentoDelDia(hora);

  // La relación con la comida solo vale para el momento en que se eligió.
  const [momentoComida, setMomentoComida] = useState<MomentoDia>(momentoDelDia(horaInicial));
  const comidaVigente: ConComida = momentoComida === momento ? comida : "no-importa";
  const etiquetaComida = relacionDeToma({ hora, conComida: comidaVigente });

  function mover(delta: number) {
    setHora((h) => deMinutos(aMinutos(h) + delta));
  }

  function elegirMomento(m: MomentoDia, horaDefecto: string) {
    setHora(horaDefecto);
    if (m !== momentoComida) setComida("no-importa");
  }

  return (
    <>
      <SheetTitle className="font-heading text-[21px] font-extrabold tracking-[-0.02em]">¿A qué hora?</SheetTitle>
      <SheetDescription className="sr-only">Elegí el momento del día y la hora</SheetDescription>

      <div className="eyebrow mb-2.5 mt-[18px] text-subtle">Momento del día</div>
      <div className="flex gap-2">
        {MOMENTOS_SELECTOR.map((m) => (
          <button
            key={m.momento}
            type="button"
            onClick={() => elegirMomento(m.momento, m.hora)}
            className={cn(
              "flex-1 rounded-[14px] px-0.5 py-3 text-[12.5px] font-bold transition-all motion-reduce:transition-none",
              momento === m.momento ? CHIP_ON : CHIP_OFF
            )}
          >
            {m.etiqueta}
          </button>
        ))}
      </div>

      {conComidas && (
        <>
          <div className="eyebrow mb-2.5 mt-5 text-subtle">Con las comidas · {momentoLabel(momento)}</div>
          <div className="flex flex-wrap gap-[7px]">
            <button
              type="button"
              onClick={() => {
                setComida("no-importa");
                setMomentoComida(momento);
              }}
              className={cn("rounded-full px-[13px] py-2.5 text-[12.5px] font-bold transition-all motion-reduce:transition-none", comidaVigente === "no-importa" ? CHIP_ON : CHIP_OFF)}
            >
              Ninguna
            </button>
            {COMIDAS_SELECTOR.filter((c) => c.momento === momento).map((c) => {
              const activa = comidaVigente === c.conComida && etiquetaComida === c.etiqueta;
              return (
                <button
                  key={c.etiqueta}
                  type="button"
                  onClick={() => {
                    setHora(c.hora);
                    setComida(c.conComida);
                    setMomentoComida(c.momento);
                  }}
                  className={cn("rounded-full px-[13px] py-2.5 text-[12.5px] font-bold transition-all motion-reduce:transition-none", activa ? CHIP_ON : CHIP_OFF)}
                >
                  {c.etiqueta}
                </button>
              );
            })}
          </div>
        </>
      )}

      <div className="eyebrow mb-2.5 mt-5 text-subtle">Hora</div>
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={() => mover(-30)}
          aria-label="30 minutos menos"
          className="h-[60px] w-[52px] rounded-[var(--radius-item)] bg-canvas text-2xl font-bold text-slate-brand transition-transform active:scale-95 motion-reduce:transition-none"
        >
          −
        </button>
        <div
          aria-live="polite"
          className="flex h-[60px] flex-1 items-center justify-center rounded-[var(--radius-item)] bg-canvas font-heading text-[30px] font-bold tabular-nums tracking-[-0.04em]"
        >
          {hora}
        </div>
        <button
          type="button"
          onClick={() => mover(30)}
          aria-label="30 minutos más"
          className="h-[60px] w-[52px] rounded-[var(--radius-item)] bg-canvas text-2xl font-bold text-slate-brand transition-transform active:scale-95 motion-reduce:transition-none"
        >
          +
        </button>
      </div>

      <button
        type="button"
        onClick={() => onConfirmar(hora, conComidas ? comidaVigente : "no-importa")}
        className="mt-5 w-full rounded-full bg-primary py-[17px] font-heading text-[15px] font-extrabold tracking-[-0.01em] text-primary-foreground shadow-cta transition-transform active:scale-[0.98] motion-reduce:transition-none"
      >
        Confirmar
      </button>
    </>
  );
}

function momentoLabel(m: MomentoDia): string {
  return MOMENTOS_SELECTOR.find((x) => x.momento === m)?.etiqueta.toLowerCase() ?? "";
}

/** Fila "1.ª toma · hora" que abre el selector (D:2182). */
export function FilaHora({
  etiqueta,
  hora,
  relacion,
  placeholderRelacion = "Elegí si va con alguna comida",
  onClick,
}: {
  etiqueta: string;
  hora: string;
  /** null = no se muestra la línea de relación (turnos). */
  relacion?: string | null;
  placeholderRelacion?: string | null;
  onClick: () => void;
}) {
  const linea = relacion ?? placeholderRelacion;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-[var(--radius-item)] bg-card px-[18px] py-[15px] text-left shadow-item transition-transform active:scale-[0.99] motion-reduce:transition-none"
    >
      <VitaIcon name="clock" size={17} className="shrink-0 text-subtle" />
      <div className="min-w-0 flex-1">
        <div className="eyebrow text-subtle">{etiqueta}</div>
        {linea && <div className={cn("mt-[3px] text-[13px] font-bold", relacion ? "text-teal-deep" : "text-faint")}>{linea}</div>}
      </div>
      <div className="font-heading text-base font-extrabold tabular-nums tracking-[-0.02em]">{hora || "--:--"}</div>
    </button>
  );
}
