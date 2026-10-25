"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { marcarTomadoAction } from "@/app/app/rutina/actions";

// "Toma vencida" (V7, Home): una dosis de hoy (o de ayer, hasta las 00:30) que ya pasó de hora y no se
// marcó. "Marcar tomada" usa la misma acción de siempre (descuenta stock,
// respeta el rol). Quien solo mira (rol "ver") ve el aviso pero no el botón.
export type DosisVencida = { id: string; nombre: string; dosis: string; hora: string; deAyer?: boolean };

export function TarjetaDosisVencida({ vencidas, puedeEditar }: { vencidas: DosisVencida[]; puedeEditar: boolean }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [resueltas, setResueltas] = useState<string[]>([]);

  const visibles = vencidas.filter((v) => !resueltas.includes(v.id));
  if (visibles.length === 0) return null;
  const primera = visibles[0];

  function marcar() {
    startTransition(async () => {
      try {
        const r = await marcarTomadoAction(primera.id, true);
        if (r.status === "error") {
          toast.error(r.message);
          return;
        }
        setResueltas((prev) => [...prev, primera.id]);
        toast.success(`${primera.nombre} marcada como tomada`);
        router.refresh();
      } catch {
        toast.error("No se pudo registrar la toma.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-[20px] border-[1.5px] border-aviso/35 bg-card p-4 shadow-card">
      <div className="flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-[13px] bg-aviso-tint text-lg font-extrabold text-aviso-ink" aria-hidden>
          !
        </div>
        <div className="min-w-0 flex-1">
          <div className="eyebrow text-aviso-ink">{visibles.length > 1 ? `${visibles.length} tomas vencidas` : "Toma vencida"}</div>
          <div className="mt-[3px] truncate font-heading text-[15px] font-extrabold tracking-[-0.02em]">
            {primera.nombre}
            {primera.dosis ? ` · ${primera.dosis}` : ""}
          </div>
          <div className="mt-0.5 text-[11.5px] font-medium text-subtle">Era {primera.deAyer ? "ayer " : ""}a las {primera.hora} hs · sin marcar</div>
        </div>
      </div>
      {puedeEditar && (
        <button
          type="button"
          onClick={marcar}
          disabled={pendiente}
          className="rounded-full bg-primary py-[13px] text-sm font-extrabold text-primary-foreground shadow-cta disabled:opacity-60"
        >
          {pendiente ? "Marcando…" : "Marcar tomada"}
        </button>
      )}
    </div>
  );
}
