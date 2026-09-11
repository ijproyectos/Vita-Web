"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

// Toggle puramente decorativo — cambia visualmente pero no persiste nada
// (no hay infraestructura de notificaciones push conectada). Mismo
// criterio que "recordatorios manuales" en NutrIA: no fabricar un
// comportamiento real detrás de un switch.
export function ToggleRow({ label, sub, defaultOn, ultimo }: { label: string; sub?: string; defaultOn?: boolean; ultimo?: boolean }) {
  const [on, setOn] = useState(!!defaultOn);
  return (
    <div className={cn("flex items-center gap-3 px-4.5 py-3.5", !ultimo && "border-b")}>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">{label}</div>
        {sub && <div className="mt-0.5 text-[11.5px] text-muted-foreground">{sub}</div>}
      </div>
      <button
        type="button"
        onClick={() => setOn((v) => !v)}
        className={cn("relative h-[26px] w-11 shrink-0 rounded-full transition-colors", on ? "bg-primary" : "bg-black/15")}
        aria-pressed={on}
      >
        <span className={cn("absolute top-[3px] size-5 rounded-full bg-white shadow transition-all", on ? "left-[21px]" : "left-[3px]")} />
      </button>
    </div>
  );
}
