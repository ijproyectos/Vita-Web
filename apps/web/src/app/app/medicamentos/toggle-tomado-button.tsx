"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { marcarTomadoAction } from "./actions";

export function ToggleTomadoButton({
  medicamentoId,
  tomadoInicial,
}: {
  medicamentoId: string;
  tomadoInicial: boolean;
}) {
  const [tomado, setTomado] = useState(tomadoInicial);
  const [pendiente, startTransition] = useTransition();

  function alternar() {
    const nuevoValor = !tomado;
    setTomado(nuevoValor); // optimista
    startTransition(async () => {
      try {
        await marcarTomadoAction(medicamentoId, nuevoValor);
      } catch {
        setTomado(!nuevoValor); // revertir si falló
      }
    });
  }

  return (
    <button
      type="button"
      onClick={alternar}
      disabled={pendiente}
      aria-pressed={tomado}
      className={cn(
        "flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors disabled:opacity-60",
        tomado
          ? "border-primary bg-primary text-primary-foreground"
          : "border-input bg-transparent text-muted-foreground hover:text-foreground"
      )}
    >
      <Check className="size-3.5" />
      {tomado ? "Tomado" : "Marcar tomado"}
    </button>
  );
}
