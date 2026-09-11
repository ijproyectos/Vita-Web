"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { VitaIcon } from "@/lib/vita-icons";
import { eliminarMedicamentoAction } from "./actions";

// El módulo viejo de Medicamentos (retirado al migrar a Rutina) tenía
// forma de borrar un medicamento cargado por error; el diseño nuevo no
// tiene una pantalla de detalle propia para eso, así que el botón vive
// acá directo, discreto (hallazgo real del review — sin esto no había
// ningún camino en la UI para eliminar un medicamento).
export function EliminarMedButton({ medicamentoId, nombre }: { medicamentoId: string; nombre: string }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();

  return (
    <button
      type="button"
      aria-label={`Eliminar ${nombre}`}
      disabled={pendiente}
      onClick={() => {
        if (!window.confirm(`¿Eliminar "${nombre}"? Se borra también su historial de tomas.`)) return;
        startTransition(async () => {
          try {
            await eliminarMedicamentoAction(medicamentoId);
            router.refresh();
          } catch {
            toast.error("No se pudo eliminar el medicamento.");
          }
        });
      }}
      className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground disabled:opacity-50"
    >
      <VitaIcon name="close" size={14} />
    </button>
  );
}
