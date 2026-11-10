"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/utils";
import { VitaIcon } from "@/lib/vita-icons";
import { normalizar, sugerirMedicamentos, type Sugerencia } from "@/lib/medicamentos/catalogo";

// Nombre de medicamento con sugerencias del catálogo local, igual que la
// especialidad de los turnos (CampoEspecialidad): filtra por cualquier parte
// del nombre comercial o del genérico, muestra la lista abajo y la persona
// elige. No completa en línea. Al elegir una marca el nombre queda "Forxiga"
// (lo que la persona conoce y se muestra siempre) y la droga se avisa aparte
// para su propio campo: `onElegir` recibe los dos juntos (un solo cambio de
// estado; con dos llamadas seguidas la segunda pisaría a la primera).
// Enter elige la sugerencia marcada (o la primera) y NUNCA envía el
// formulario, así no se guarda un nombre a medio escribir. El texto libre
// sigue valiendo para lo que no esté en la lista. Siempre controlado.
//
// `alta`: la fila completa (ícono, campo, borrar) con la lista debajo, en el
// flujo de la página. `pill`: solo el campo, para la edición en línea, con la
// lista flotando encima del resto (la fila es angosta).

type Variante = "alta" | "pill";

export function CampoMedicamento({
  value,
  onChange,
  name,
  placeholder,
  variante = "alta",
  ariaLabel,
  onElegir,
}: {
  value: string;
  onChange: (valor: string) => void;
  /**
   * Al elegir de la lista: el nombre y la droga de esa marca (null si se
   * eligió el genérico). Si no se pasa, solo se escribe el nombre con `onChange`.
   */
  onElegir?: (eleccion: { nombre: string; droga: string | null }) => void;
  name?: string;
  placeholder?: string;
  variante?: Variante;
  ariaLabel?: string;
}) {
  const idLista = useId();
  const [enfocado, setEnfocado] = useState(false);
  const [elegida, setElegida] = useState(false);
  const [activo, setActivo] = useState(-1);

  const sugerencias = sugerirMedicamentos(value);
  // Ya escrita igual que la única sugerencia: no hace falta la lista.
  const yaEscrita = sugerencias.length === 1 && normalizar(nombreVisible(sugerencias[0])) === normalizar(value);
  const mostrarLista = !elegida && !yaEscrita && sugerencias.length > 0 && (variante === "alta" || enfocado);
  const idOpcion = (i: number) => `${idLista}-op-${i}`;

  function escribir(valor: string) {
    onChange(valor);
    setElegida(false);
    setActivo(-1);
  }

  function elegir(s: Sugerencia) {
    if (onElegir) onElegir({ nombre: nombreVisible(s), droga: s.marca ? s.nombre : null });
    else onChange(nombreVisible(s));
    setElegida(true);
    setActivo(-1);
  }

  function alTeclear(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!mostrarLista) return;
      e.preventDefault();
      const n = sugerencias.length;
      setActivo((a) => (e.key === "ArrowDown" ? (a + 1) % n : a <= 0 ? n - 1 : a - 1));
    } else if (e.key === "Enter") {
      // Enter en el nombre nunca guarda: elige de la lista si está abierta.
      e.preventDefault();
      if (mostrarLista) elegir(sugerencias[activo >= 0 ? activo : 0]);
    } else if (e.key === "Escape" && mostrarLista) {
      e.preventDefault();
      setElegida(true);
    }
  }

  const campo = (
    <input
      type="text"
      name={name}
      value={value}
      onChange={(e) => escribir(e.target.value)}
      onFocus={() => setEnfocado(true)}
      onBlur={() => {
        setEnfocado(false);
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
      className={
        variante === "alta"
          ? "min-w-0 flex-1 bg-transparent py-[11px] text-[15.5px] font-semibold outline-none placeholder:font-medium placeholder:text-faint"
          : "w-full rounded-full border border-foreground/10 bg-canvas/60 px-4 py-[11px] text-sm font-semibold outline-none placeholder:font-medium placeholder:text-faint focus-visible:ring-2 focus-visible:ring-primary/40"
      }
    />
  );

  const lista = mostrarLista && (
    <ul
      id={idLista}
      role="listbox"
      aria-label="Sugerencias de medicamentos"
      className={cn(
        "overflow-hidden rounded-[var(--radius-item)] bg-card shadow-item",
        variante === "alta" ? "mt-2" : "absolute inset-x-0 top-full z-30 mt-1.5 max-h-60 overflow-y-auto ring-1 ring-foreground/[0.08]"
      )}
    >
      {sugerencias.map((s, i) => (
        <li
          key={`${s.nombre}-${s.marca ?? ""}`}
          id={idOpcion(i)}
          role="option"
          aria-selected={i === activo}
          // mousedown (no click) para elegir antes de que el campo pierda el foco.
          onMouseDown={(e) => {
            e.preventDefault();
            elegir(s);
          }}
          onMouseEnter={() => setActivo(i)}
          className={cn(
            "flex cursor-pointer items-center gap-3 px-4 py-3",
            i > 0 && "border-t border-foreground/[0.06]",
            i === activo && "bg-chip-teal-bg"
          )}
        >
          <VitaIcon name="pill" size={16} color="var(--teal-deep)" className="shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold">{nombreVisible(s)}</span>
            {s.marca && <span className="block truncate text-[11.5px] font-medium text-subtle">{s.nombre}</span>}
          </span>
        </li>
      ))}
    </ul>
  );

  if (variante === "pill") {
    return (
      <div className="relative min-w-0 flex-1">
        {campo}
        {lista}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 rounded-full bg-card py-1 pl-[18px] pr-1.5 shadow-item">
        <VitaIcon name="pill" size={18} className="shrink-0 text-subtle" />
        {campo}
        {value && (
          <button
            type="button"
            onClick={() => escribir("")}
            aria-label="Borrar el nombre"
            className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-secondary text-subtle"
          >
            <VitaIcon name="close" size={12} strokeWidth={3} />
          </button>
        )}
      </div>
      {lista}
    </div>
  );
}

/** Lo que queda en el campo al elegir: la marca si se buscó por marca, si no el genérico. */
function nombreVisible(s: Sugerencia): string {
  return s.marca ?? s.nombre;
}
