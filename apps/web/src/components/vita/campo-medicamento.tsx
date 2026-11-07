"use client";

import { useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  completarEnLinea,
  etiquetaSugerencia,
  normalizar,
  sugerirMedicamentos,
  type Sugerencia,
} from "@/lib/medicamentos/catalogo";

// Campo de nombre de medicamento con autocompletado local (catálogo de
// lib/medicamentos/catalogo). Siempre controlado, nunca guarda nada: solo
// rellena el texto. El texto libre sigue valiendo para lo que no esté en la
// lista. Combobox accesible: flechas, Enter, Escape y Tab/→ para aceptar la
// terminación en línea.

type Variante = "alta" | "pill";

const CLASE_INPUT: Record<Variante, string> = {
  alta: "min-w-0 w-full bg-transparent py-3.5 text-[15.5px] font-semibold outline-none placeholder:font-medium placeholder:text-faint",
  pill: "w-full rounded-full border border-foreground/10 bg-canvas/60 px-4 py-[11px] text-sm font-semibold outline-none placeholder:font-medium placeholder:text-faint focus-visible:ring-2 focus-visible:ring-primary/40",
};

// Mismas métricas que el input, para que el resto en gris caiga justo detrás
// del texto escrito.
const CLASE_FANTASMA: Record<Variante, string> = {
  alta: "py-3.5 text-[15.5px] font-semibold",
  pill: "border border-transparent px-4 py-[11px] text-sm font-semibold",
};

export function CampoMedicamento({
  value,
  onChange,
  name,
  placeholder,
  variante = "alta",
  ariaLabel,
}: {
  value: string;
  onChange: (valor: string) => void;
  name?: string;
  placeholder?: string;
  variante?: Variante;
  ariaLabel?: string;
}) {
  const idLista = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(-1);

  const sugerencias = sugerirMedicamentos(value);
  const completado = completarEnLinea(value);
  const restoFantasma = abierto && completado && activo < 0 ? completado.slice(value.length) : "";

  // Con una sola sugerencia ya cubierta por el texto en línea (o ya escrita
  // completa) la lista sería redundante.
  const unica = sugerencias.length === 1 ? sugerencias[0] : null;
  const listaRedundante =
    unica !== null && !unica.marca && (completado !== null || normalizar(unica.nombre) === normalizar(value));
  const mostrarLista = abierto && sugerencias.length > 0 && !listaRedundante;
  const idOpcion = (i: number) => `${idLista}-op-${i}`;

  function elegir(s: Sugerencia) {
    onChange(s.nombre);
    setAbierto(false);
    setActivo(-1);
  }

  function aceptarFantasma() {
    if (!completado) return;
    onChange(completado);
    setAbierto(false);
  }

  function alTeclear(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (sugerencias.length === 0) return;
      e.preventDefault();
      setAbierto(true);
      const n = sugerencias.length;
      setActivo((a) => (e.key === "ArrowDown" ? (a + 1) % n : a <= 0 ? n - 1 : a - 1));
    } else if (e.key === "Enter") {
      if (mostrarLista && activo >= 0 && sugerencias[activo]) {
        e.preventDefault();
        elegir(sugerencias[activo]);
      }
    } else if (e.key === "Escape") {
      if (abierto) {
        e.preventDefault();
        setAbierto(false);
        setActivo(-1);
      }
    } else if (e.key === "Tab" && !e.shiftKey) {
      if (restoFantasma) {
        e.preventDefault();
        aceptarFantasma();
      }
    } else if (e.key === "ArrowRight") {
      const el = e.currentTarget;
      if (restoFantasma && el.selectionStart === value.length && el.selectionEnd === value.length) {
        e.preventDefault();
        aceptarFantasma();
      }
    }
  }

  return (
    <div className="relative min-w-0 flex-1">
      <input
        ref={inputRef}
        type="text"
        name={name}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setAbierto(true);
          setActivo(-1);
        }}
        onFocus={() => setAbierto(true)}
        onBlur={() => {
          setAbierto(false);
          setActivo(-1);
        }}
        onKeyDown={alTeclear}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoComplete="off"
        autoCapitalize="sentences"
        spellCheck={false}
        role="combobox"
        aria-autocomplete="both"
        aria-expanded={mostrarLista}
        aria-controls={mostrarLista ? idLista : undefined}
        aria-activedescendant={mostrarLista && activo >= 0 ? idOpcion(activo) : undefined}
        className={CLASE_INPUT[variante]}
      />
      {restoFantasma && (
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 flex items-center overflow-hidden whitespace-pre",
            CLASE_FANTASMA[variante]
          )}
        >
          <span className="invisible">{value}</span>
          <span className="text-faint">{restoFantasma}</span>
        </div>
      )}
      {mostrarLista && (
        <ul
          id={idLista}
          role="listbox"
          aria-label="Sugerencias de medicamentos"
          className="absolute inset-x-0 top-full z-30 mt-1.5 max-h-60 overflow-y-auto rounded-[16px] bg-card py-1.5 shadow-card ring-1 ring-foreground/[0.08]"
        >
          {sugerencias.map((s, i) => (
            <li
              key={`${s.nombre}-${s.marca ?? ""}`}
              id={idOpcion(i)}
              role="option"
              aria-selected={i === activo}
              // mousedown (no click) para elegir antes de que el input pierda el foco.
              onMouseDown={(e) => {
                e.preventDefault();
                elegir(s);
              }}
              onMouseEnter={() => setActivo(i)}
              className={cn(
                "cursor-pointer truncate px-4 py-2.5 text-sm font-semibold",
                i === activo ? "bg-chip-teal-bg text-chip-teal-ink" : "text-foreground"
              )}
            >
              {s.marca ? (
                <>
                  {s.marca} <span className="font-medium text-subtle">({s.nombre})</span>
                </>
              ) : (
                etiquetaSugerencia(s)
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
