"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { VitaIcon } from "@/lib/vita-icons";
import { eliminarEstudioAction } from "./estudio-actions";

export function EliminarEstudioButton({ estudioId, nombre }: { estudioId: string; nombre: string }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();

  return (
    <button
      type="button"
      aria-label={`Eliminar ${nombre}`}
      disabled={pendiente}
      onClick={() => {
        if (!window.confirm(`¿Eliminar "${nombre}"?`)) return;
        startTransition(async () => {
          const resultado = await eliminarEstudioAction(estudioId);
          if (resultado.status === "error") toast.error(resultado.message);
          else router.refresh();
        });
      }}
      className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground disabled:opacity-50"
    >
      <VitaIcon name="close" size={14} />
    </button>
  );
}
