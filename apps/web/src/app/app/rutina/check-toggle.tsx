"use client";

import { useState, useTransition } from "react";
import { VitaIcon } from "@/lib/vita-icons";
import { cn } from "@/lib/utils";
import { marcarTomadoAction } from "./actions";

// Círculo de check que se llena en gradiente teal al tocar — porta
// `.check`/`.check.on` de styles.css (usado en Home y Rutina).
export function CheckToggle({ medicamentoId, tomadoInicial }: { medicamentoId: string; tomadoInicial: boolean }) {
  const [tomado, setTomado] = useState(tomadoInicial);
  const [pendiente, startTransition] = useTransition();

  function alternar() {
    const nuevoValor = !tomado;
    setTomado(nuevoValor);
    startTransition(async () => {
      try {
        await marcarTomadoAction(medicamentoId, nuevoValor);
      } catch {
        setTomado(!nuevoValor);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={alternar}
      disabled={pendiente}
      aria-pressed={tomado}
      aria-label={tomado ? "Marcar como no tomado" : "Marcar como tomado"}
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-full transition-all disabled:opacity-60",
        tomado
          ? "bg-gradient-to-br from-[#22d3ee] to-[#0e7490] text-white shadow-[0_4px_10px_rgba(8,145,178,0.35)]"
          : "bg-muted text-transparent"
      )}
    >
      <VitaIcon name="check" size={16} />
    </button>
  );
}
