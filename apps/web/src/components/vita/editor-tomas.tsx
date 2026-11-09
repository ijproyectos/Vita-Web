"use client";

import { useState } from "react";
import { SelectorHora } from "@/components/vita/selector-hora";
import { VitaIcon } from "@/lib/vita-icons";
import { relacionDeToma, type TomaForm } from "@/lib/medicamentos/comidas";
import { CONFIG_FORMA, etiquetaCantidad, pasoCantidad, siguienteHora, type FormaMedicamento } from "@/lib/medicamentos/forma";

// Tomas de un medicamento (V7): una tarjeta por toma con su hora, su cantidad y
// el botón para quitarla, más "Agregar horario" y el selector de hora. Las usan
// igual el alta y la edición, así se ven idénticas.

const MAX_TOMAS_PANTALLA = 4;

export function EditorTomas({
  tomas,
  onCambio,
  forma,
}: {
  tomas: TomaForm[];
  onCambio: (tomas: TomaForm[]) => void;
  forma: FormaMedicamento;
}) {
  const [editando, setEditando] = useState<number | null>(null);
  const actual = editando !== null ? tomas[editando] : undefined;
  const horas = tomas.map((t) => t.hora);
  const repetidas = new Set(horas).size !== horas.length;
  const config = CONFIG_FORMA[forma];

  function cambiarCantidad(i: number, direccion: 1 | -1) {
    onCambio(tomas.map((t, k) => (k === i ? { ...t, cantidad: pasoCantidad(forma, t.cantidad ?? config.porDefecto, direccion) } : t)));
  }

  function agregar() {
    onCambio([...tomas, { hora: siguienteHora(horas), conComida: "no-importa", indicacion: null, cantidad: config.porDefecto }]);
  }

  return (
    <>
      <div className="flex flex-col gap-[9px]">
        {tomas.map((t, i) => {
          const relacion = relacionDeToma(t);
          return (
            <div key={t.id ?? `n${i}`} className="flex flex-wrap items-center gap-3 rounded-[var(--radius-item)] bg-card px-[18px] py-[15px] shadow-item">
              <button type="button" onClick={() => setEditando(i)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <VitaIcon name="clock" size={17} className="shrink-0 text-subtle" />
                <span className="min-w-0 flex-1">
                  <span className="eyebrow block text-subtle">{`${i + 1}.ª toma`}</span>
                  <span className={`mt-[3px] block text-[13px] font-bold ${relacion ? "text-teal-deep" : "text-faint"}`}>
                    {relacion ?? "Elegí si va con alguna comida"}
                  </span>
                </span>
                <span className="font-heading text-base font-extrabold tabular-nums tracking-[-0.02em]">{t.hora || "--:--"}</span>
              </button>
              {tomas.length > 1 && (
                <button
                  type="button"
                  onClick={() => onCambio(tomas.filter((_, k) => k !== i))}
                  aria-label={`Quitar la toma de las ${t.hora}`}
                  className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-secondary text-subtle active:scale-[0.92] motion-reduce:transform-none"
                >
                  <VitaIcon name="close" size={12} strokeWidth={3} />
                </button>
              )}
              <div className="mt-px flex basis-full items-center justify-between gap-2.5 border-t border-foreground/[0.06] pt-[11px]">
                <span className="text-[13px] font-bold text-slate-brand">{config.tituloCantidad}</span>
                <span className="flex items-center gap-1.5">
                  <BotonPaso texto="−" etiqueta="Menos" onClick={() => cambiarCantidad(i, -1)} />
                  <span className="min-w-[86px] text-center text-sm font-extrabold">{etiquetaCantidad(forma, t.cantidad ?? config.porDefecto)}</span>
                  <BotonPaso texto="+" etiqueta="Más" onClick={() => cambiarCantidad(i, 1)} />
                </span>
              </div>
            </div>
          );
        })}
        {tomas.length < MAX_TOMAS_PANTALLA && (
          <button
            type="button"
            onClick={agregar}
            className="flex items-center justify-center gap-[7px] rounded-[var(--radius-item)] border-[1.5px] border-dashed border-primary/45 p-[13px] text-[13.5px] font-extrabold text-teal-deep active:scale-[0.98] motion-reduce:transform-none"
          >
            <VitaIcon name="plus" size={14} strokeWidth={2.8} />
            Agregar horario
          </button>
        )}
      </div>
      {repetidas && <p className="mt-2 pl-1 text-xs font-semibold text-destructive">Hay dos tomas a la misma hora.</p>}
      <SelectorHora
        abierto={editando !== null}
        hora={actual?.hora ?? "08:00"}
        comida={{ conComida: actual?.conComida ?? "no-importa", indicacion: actual?.indicacion ?? null }}
        conComidas
        onCerrar={() => setEditando(null)}
        onConfirmar={(hora, comida) => {
          onCambio(tomas.map((t, i) => (i === editando ? { ...t, hora, ...comida } : t)));
          setEditando(null);
        }}
      />
    </>
  );
}

function BotonPaso({ texto, etiqueta, onClick }: { texto: string; etiqueta: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={etiqueta}
      className="flex size-8 items-center justify-center rounded-full bg-secondary text-lg font-extrabold text-slate-brand active:scale-[0.92] motion-reduce:transform-none"
    >
      {texto}
    </button>
  );
}
