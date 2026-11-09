"use client";

import { VitaIcon } from "@/lib/vita-icons";
import { cn } from "@/lib/utils";
import { META_MEDICION, type TipoMedicion, type TipoRegistrable } from "@/lib/mediciones/tipos";

/** Chips para elegir qué medir: los mismos al crear un monitoreo y al cargar un valor. */
export function ChipsMetrica({
  tipos,
  valor,
  onElegir,
}: {
  tipos: readonly TipoMedicion[];
  valor: TipoRegistrable;
  onElegir: (tipo: TipoMedicion) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {tipos.map((t) => {
        const sel = valor === t;
        return (
          <button
            key={t}
            type="button"
            onClick={() => onElegir(t)}
            aria-pressed={sel}
            className={cn(
              "inline-flex items-center gap-[7px] rounded-full px-4 py-[11px] text-[13.5px] font-bold transition-all motion-reduce:transition-none",
              sel ? "bg-primary text-primary-foreground shadow-cta" : "bg-card text-slate-brand shadow-item"
            )}
          >
            <VitaIcon name={META_MEDICION[t].icono} size={16} />
            {META_MEDICION[t].nombre}
          </button>
        );
      })}
    </div>
  );
}
