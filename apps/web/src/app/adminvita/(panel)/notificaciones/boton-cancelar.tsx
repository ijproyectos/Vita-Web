"use client";

import { useState, useTransition } from "react";
import { cancelarEnvioMasivoAction } from "./actions";

export function BotonCancelarEnvio({ id, titulo }: { id: string; titulo: string }) {
  const [confirmando, setConfirmando] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!confirmando) {
    return (
      <button type="button" onClick={() => setConfirmando(true)} className="text-xs font-bold text-destructive underline underline-offset-2">
        Cancelar envío
      </button>
    );
  }
  return (
    <div role="alertdialog" aria-label={`Confirmar la cancelación de ${titulo}`} className="flex flex-col gap-1">
      <span className="text-xs font-semibold">¿Cancelar? Lo que ya salió no se retira.</span>
      <span className="flex gap-2">
        <button
          type="button"
          disabled={pendiente}
          onClick={() =>
            iniciar(async () => {
              const r = await cancelarEnvioMasivoAction(id);
              if (r.status === "error") setError(r.mensaje);
              else setConfirmando(false);
            })
          }
          className="rounded-full bg-destructive px-3 py-1 text-xs font-bold text-destructive-foreground disabled:opacity-60"
        >
          {pendiente ? "Cancelando…" : "Sí, cancelar"}
        </button>
        <button type="button" disabled={pendiente} onClick={() => setConfirmando(false)} className="rounded-full border border-line px-3 py-1 text-xs font-bold">
          Volver
        </button>
      </span>
      {error ? (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      ) : null}
    </div>
  );
}
