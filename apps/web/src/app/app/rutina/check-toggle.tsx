"use client";

import { VitaIcon } from "@/lib/vita-icons";
import { cn } from "@/lib/utils";

// Círculo de check que se llena de teal al tocar (`.check`/`.check.on` del
// diseño). Controlado: el estado de la toma vive en la Rutina, así la fila y
// la hoja de detalle muestran siempre lo mismo.
export function CheckToggle({
  tomado,
  pendiente,
  onAlternar,
}: {
  tomado: boolean;
  pendiente?: boolean;
  onAlternar: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onAlternar();
      }}
      disabled={pendiente}
      aria-pressed={tomado}
      aria-label={tomado ? "Marcar como no tomado" : "Marcar como tomado"}
      className={cn(
        "flex size-[30px] shrink-0 items-center justify-center rounded-full transition-all disabled:opacity-60 motion-reduce:transition-none",
        tomado
          ? "bg-primary text-primary-foreground shadow-[0_4px_10px_color-mix(in_srgb,var(--primary)_35%,transparent)]"
          : "bg-muted text-transparent"
      )}
    >
      <VitaIcon name="check" size={16} />
    </button>
  );
}
