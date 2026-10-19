"use client";

import { useState, useTransition } from "react";
import { VitaIcon } from "@/lib/vita-icons";
import { cn } from "@/lib/utils";
import { marcarTomadoAction } from "./actions";

// Círculo de check que se llena de teal al tocar — porta
// `.check`/`.check.on` de styles.css (usado en Home y Rutina).
export function CheckToggle({ medicamentoId, tomadoInicial }: { medicamentoId: string; tomadoInicial: boolean }) {
  const [tomado, setTomado] = useState(tomadoInicial);
  const [pendiente, startTransition] = useTransition();

  function alternar() {
    const nuevoValor = !tomado;
    setTomado(nuevoValor);
    startTransition(async () => {
      try {
        const resultado = await marcarTomadoAction(medicamentoId, nuevoValor);
        if (resultado.status === "error") setTomado(!nuevoValor);
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
        "flex size-[30px] shrink-0 items-center justify-center rounded-full transition-all disabled:opacity-60",
        tomado
          ? "bg-primary text-primary-foreground shadow-[0_4px_10px_color-mix(in_srgb,var(--primary)_35%,transparent)]"
          : "bg-muted text-transparent"
      )}
    >
      <VitaIcon name="check" size={16} />
    </button>
  );
}
