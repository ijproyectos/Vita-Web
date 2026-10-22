"use client";

import { cn } from "@/lib/utils";

// Control segmentado de V7: pastilla gris con la opción activa en blanco.
export function Segmentado<T extends string | number>({
  opciones,
  valor,
  onChange,
  etiqueta,
  chico,
}: {
  opciones: { valor: T; etiqueta: string }[];
  valor: T;
  onChange: (v: T) => void;
  /** aria-label del grupo. */
  etiqueta: string;
  chico?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={etiqueta} className="flex rounded-full bg-secondary p-1">
      {opciones.map((o) => {
        const activa = o.valor === valor;
        return (
          <button
            key={String(o.valor)}
            type="button"
            role="radio"
            aria-checked={activa}
            onClick={() => onChange(o.valor)}
            className={cn(
              "min-w-0 flex-1 truncate rounded-full px-2 py-[9px] text-center font-bold transition-all motion-reduce:transition-none",
              chico ? "text-[12.5px]" : "text-[13px]",
              activa ? "bg-card text-foreground shadow-item" : "text-slate-brand"
            )}
          >
            {o.etiqueta}
          </button>
        );
      })}
    </div>
  );
}
