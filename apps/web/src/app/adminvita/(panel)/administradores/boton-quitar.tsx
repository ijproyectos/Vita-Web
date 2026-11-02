"use client";

import { useState, useTransition } from "react";
import { revocarAdministradorAction } from "./actions";

// Quitar el acceso con confirmación en la propia página (sin window.confirm).
export function BotonQuitarAdministrador({ email }: { email: string }) {
  const [confirmando, setConfirmando] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!confirmando) {
    return (
      <button type="button" onClick={() => setConfirmando(true)} className="text-xs font-bold text-destructive underline underline-offset-2">
        Quitar acceso
      </button>
    );
  }
  return (
    <div role="alertdialog" aria-label={`Confirmar que se quita el acceso de ${email}`} className="flex flex-col gap-1">
      <span className="text-xs font-semibold">¿Quitar el acceso de {email}? Su sesión del panel se cierra al instante.</span>
      <span className="flex gap-2">
        <button
          type="button"
          disabled={pendiente}
          onClick={() =>
            iniciar(async () => {
              const r = await revocarAdministradorAction(email);
              if (r.status === "error") setError(r.mensaje);
              else setConfirmando(false);
            })
          }
          className="rounded-full bg-destructive px-3 py-1 text-xs font-bold text-destructive-foreground disabled:opacity-60"
        >
          {pendiente ? "Quitando…" : "Sí, quitar"}
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
