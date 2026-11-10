"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/utils";
import { etiquetaSugerencia, normalizar, sugerirMedicamentos, type Sugerencia } from "@/lib/medicamentos/catalogo";

// Campo de nombre de medicamento con sugerencias del catálogo local
// (lib/medicamentos/catalogo). Siempre controlado, nunca guarda nada: solo
// rellena el texto. No completa en línea: al escribir siempre abre la lista y
// la persona elige. Una marca se guarda como "Forxiga (Dapagliflozina)" (lo de
// paréntesis es la droga, ver lib/medicamentos/nombre). Enter elige la
// sugerencia marcada (o la primera) y NUNCA envía el formulario, así no se
// guarda un nombre a medio escribir. El texto libre sigue valiendo.

type Variante = "alta" | "pill";

const CLASE_INPUT: Record<Variante, string> = {
  alta: "min-w-0 w-full bg-transparent py-3.5 text-[15.5px] font-semibold outline-none placeholder:font-medium placeholder:text-faint",
  pill: "w-full rounded-full border border-foreground/10 bg-canvas/60 px-4 py-[11px] text-sm font-semibold outline-none placeholder:font-medium placeholder:text-faint focus-visible:ring-2 focus-visible:ring-primary/40",
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
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(-1);

  const sugerencias = sugerirMedicamentos(value);
  // Ya elegida (el texto es exactamente la única sugerencia): no hace falta la lista.
  const yaElegida = sugerencias.length === 1 && normalizar(etiquetaSugerencia(sugerencias[0])) === normalizar(value);
  const mostrarLista = abierto && sugerencias.length > 0 && !yaElegida;
  const idOpcion = (i: number) => `${idLista}-op-${i}`;

  function elegir(s: Sugerencia) {
    onChange(etiquetaSugerencia(s));
    setAbierto(false);
    setActivo(-1);
  }

  function alTeclear(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (sugerencias.length === 0) return;
      e.preventDefault();
      setAbierto(true);
      const n = sugerencias.length;
      setActivo((a) => (e.key === "ArrowDown" ? (a + 1) % n : a <= 0 ? n - 1 : a - 1));
    } else if (e.key === "Enter") {
      // Enter en el nombre nunca guarda: elige de la lista si está abierta.
      e.preventDefault();
      if (mostrarLista) elegir(sugerencias[activo >= 0 ? activo : 0]);
    } else if (e.key === "Escape") {
      if (abierto) {
        e.preventDefault();
        setAbierto(false);
        setActivo(-1);
      }
    }
  }

  return (
    <div className="relative min-w-0 flex-1">
      <input
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
        aria-autocomplete="list"
        aria-expanded={mostrarLista}
        aria-controls={mostrarLista ? idLista : undefined}
        aria-activedescendant={mostrarLista && activo >= 0 ? idOpcion(activo) : undefined}
        className={CLASE_INPUT[variante]}
      />
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

