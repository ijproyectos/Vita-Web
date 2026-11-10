"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { ChipsComida, ChipsMomento, PasoHora } from "@/components/vita/hora-momento";
import { comidaParaMomento, momentoDeToma, SIN_COMIDA, type ComidaToma } from "@/lib/medicamentos/comidas";
import type { MomentoDia } from "@/lib/medicamentos/tipos";
import { momentoDelDia } from "@/lib/rutina/momento";
import { cn } from "@/lib/utils";
import { VitaIcon } from "@/lib/vita-icons";

// Selector de hora (V7 D:3343, "¿A qué hora?"): momento del día, "Con las
// comidas" (solo las del momento elegido; solo para medicamentos y planes de
// medición), hora con − / + y Confirmar. El momento es una elección propia:
// mover la hora no lo cambia (06:30 "En ayunas" sigue siendo de la mañana) y
// elegir una comida no mueve la hora. Cambiar de momento limpia una comida de
// otro momento. Las piezas viven en hora-momento.tsx (las comparte la charla).
// Devuelve la hora "HH:MM" y la comida elegida (clave + con_comida).

export function SelectorHora({
  abierto,
  hora,
  comida,
  conComidas,
  onConfirmar,
  onCerrar,
}: {
  abierto: boolean;
  hora: string;
  comida?: ComidaToma;
  /** Muestra "Con las comidas" (medicamentos); los turnos lo ocultan. */
  conComidas: boolean;
  onConfirmar: (hora: string, comida: ComidaToma) => void;
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
          comida={comida ?? SIN_COMIDA}
          conComidas={conComidas}
          onConfirmar={onConfirmar}
        />
      </SheetContent>
    </Sheet>
  );
}

// Se monta al abrir la hoja: el estado nace de la hora/comida con que se abrió.
function Contenido({
  hora: horaInicial,
  comida: comidaInicial,
  conComidas,
  onConfirmar,
}: {
  hora: string;
  comida: ComidaToma;
  conComidas: boolean;
  onConfirmar: (hora: string, comida: ComidaToma) => void;
}) {
  const [hora, setHora] = useState(horaInicial);
  const [comida, setComida] = useState<ComidaToma>(comidaInicial);
  const [momento, setMomento] = useState<MomentoDia>(() => momentoDeToma(horaInicial, comidaInicial));
  // Si la persona ya movió la hora, elegir el momento no se la pisa.
  const [horaTocada, setHoraTocada] = useState(false);

  function elegirMomento(m: MomentoDia, horaSugerida: string) {
    setMomento(m);
    setComida((c) => comidaParaMomento(c, m));
    if (!horaTocada && momentoDelDia(hora) !== m) setHora(horaSugerida);
  }

  return (
    <>
      <SheetTitle className="font-heading text-[21px] font-extrabold tracking-[-0.02em]">¿A qué hora?</SheetTitle>
      <SheetDescription className="sr-only">Elegí el momento del día y la hora</SheetDescription>

      <div className="eyebrow mb-2.5 mt-[18px] text-subtle">Momento del día</div>
      <ChipsMomento momento={momento} onElegir={elegirMomento} />

      {conComidas && (
        <>
          <div className="eyebrow mb-2.5 mt-5 text-subtle">Con las comidas</div>
          <ChipsComida momento={momento} comida={comida} onCambio={setComida} />
        </>
      )}

      <div className="eyebrow mb-2.5 mt-5 text-subtle">Hora</div>
      <PasoHora
        hora={hora}
        onCambio={(h) => {
          setHora(h);
          setHoraTocada(true);
        }}
      />

      <button
        type="button"
        onClick={() => onConfirmar(hora, conComidas ? comida : SIN_COMIDA)}
        className="mt-5 w-full rounded-full bg-primary py-[17px] font-heading text-[15px] font-extrabold tracking-[-0.01em] text-primary-foreground shadow-cta transition-transform active:scale-[0.98] motion-reduce:transition-none"
      >
        Confirmar
      </button>
    </>
  );
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
