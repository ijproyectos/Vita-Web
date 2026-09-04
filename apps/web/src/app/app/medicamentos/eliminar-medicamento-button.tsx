"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { eliminarMedicamentoAction } from "./actions";

export function EliminarMedicamentoButton({
  medicamentoId,
  nombre,
}: {
  medicamentoId: string;
  nombre: string;
}) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      disabled={pendiente}
      aria-label={`Eliminar ${nombre}`}
      onClick={() => {
        if (!window.confirm(`¿Eliminar "${nombre}"? Se borra también su historial de tomas.`)) {
          return;
        }
        startTransition(async () => {
          await eliminarMedicamentoAction(medicamentoId);
          router.refresh();
        });
      }}
    >
      <Trash2 className="size-4 text-muted-foreground" />
    </Button>
  );
}
