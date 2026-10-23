"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { VitaIcon } from "@/lib/vita-icons";
import { eliminarMedicionAction } from "./actions";

export function EliminarMedicionButton({ medicionId, descripcion }: { medicionId: string; descripcion: string }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [confirmando, setConfirmando] = useState(false);

  if (confirmando) {
    return (
      <div role="group" aria-label={`¿Eliminar la medición ${descripcion}?`} className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          disabled={pendiente}
          onClick={() =>
            startTransition(async () => {
              try {
                const resultado = await eliminarMedicionAction(medicionId);
                if (resultado.status === "error") toast.error(resultado.message);
                else router.refresh();
              } catch {
                toast.error("No se pudo eliminar la medición. Probá de nuevo.");
              }
              setConfirmando(false);
            })
          }
          className="rounded-full bg-destructive px-2.5 py-1 text-[11.5px] font-extrabold text-destructive-foreground disabled:opacity-60"
        >
          {pendiente ? "Borrando…" : "Eliminar"}
        </button>
        <button type="button" disabled={pendiente} onClick={() => setConfirmando(false)} className="rounded-full px-2 py-1 text-[11.5px] font-bold text-slate-brand">
          No
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      aria-label={`Eliminar medición ${descripcion}`}
      disabled={pendiente}
      onClick={() => setConfirmando(true)}
      className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground disabled:opacity-50"
    >
      <VitaIcon name="close" size={14} />
    </button>
  );
}
