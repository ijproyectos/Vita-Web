"use client";

import { cn } from "@/lib/utils";

// Interruptor on/off de V7 (46×28, perilla blanca). Solo presentación.
export function Interruptor({
  activo,
  onChange,
  label,
  disabled,
}: {
  activo: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!activo)}
      className={cn(
        "relative h-7 w-[46px] shrink-0 rounded-full transition-colors disabled:opacity-50 motion-reduce:transition-none",
        activo ? "bg-primary" : "bg-foreground/15"
      )}
    >
      <span
        className={cn(
          "absolute top-[3px] size-[22px] rounded-full bg-card shadow transition-all motion-reduce:transition-none",
          activo ? "left-[21px]" : "left-[3px]"
        )}
      />
    </button>
  );
}
