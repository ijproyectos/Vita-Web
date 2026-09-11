"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { VitaIcon } from "@/lib/vita-icons";
import { marcarTodosTomadosAction } from "./actions";

// Regresión real encontrada por el review: el botón de marcar todo de una
// se había perdido al migrar de Medicamentos (dialog viejo) a Rutina.
export function MarcarTodosButton() {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pendiente}
      onClick={() =>
        startTransition(async () => {
          try {
            await marcarTodosTomadosAction();
            router.refresh();
          } catch {
            toast.error("No se pudo marcar todo como tomado.");
          }
        })
      }
      className="flex items-center justify-center gap-1.5 rounded-full bg-secondary py-2.5 text-[13px] font-semibold text-primary disabled:opacity-60"
    >
      <VitaIcon name="check" size={14} />
      {pendiente ? "Marcando…" : "Marcar todos como tomados"}
    </button>
  );
}
