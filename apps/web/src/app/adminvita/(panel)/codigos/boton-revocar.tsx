"use client";

import { useState, useTransition } from "react";
import { revocarCodigoAction } from "./actions";

// Revocar con confirmación en la propia página (sin window.confirm).
export function BotonRevocar({ id, ultimos4 }: { id: string; ultimos4: string }) {
  const [confirmando, setConfirmando] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!confirmando) {
    return (
      <button type="button" onClick={() => setConfirmando(true)} className="text-xs font-bold text-destructive underline underline-offset-2">
        Revocar
      </button>
    );
  }
  return (
    <div role="alertdialog" aria-label={`Confirmar revocación del código terminado en ${ultimos4}`} className="flex flex-col gap-1">
      <span className="text-xs font-semibold">¿Revocar …{ultimos4}? No podrá canjearse más.</span>
      <span className="flex gap-2">
        <button
          type="button"
          disabled={pendiente}
          onClick={() =>
            iniciar(async () => {
              const r = await revocarCodigoAction(id);
              if (r.status === "error") setError(r.mensaje);
              else setConfirmando(false);
            })
          }
          className="rounded-full bg-destructive px-3 py-1 text-xs font-bold text-destructive-foreground disabled:opacity-60"
        >
          {pendiente ? "Revocando…" : "Sí, revocar"}
        </button>
        <button type="button" disabled={pendiente} onClick={() => setConfirmando(false)} className="rounded-full border border-line px-3 py-1 text-xs font-bold">
          Cancelar
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
