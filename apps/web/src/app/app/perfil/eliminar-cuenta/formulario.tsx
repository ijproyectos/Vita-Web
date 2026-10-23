"use client";

import { useActionState, useState } from "react";
import { cn } from "@/lib/utils";
import { PALABRA_CONFIRMACION, type EstadoEliminarCuenta } from "@/lib/cuenta/tipos";
import { eliminarCuentaAction } from "../actions";

const ESTADO_INICIAL: EstadoEliminarCuenta = { status: "idle" };

// Confirmación escrita (ELIMINAR) + botón. Si la palabra no coincide el botón
// queda deshabilitado; la Server Action vuelve a validar todo.
export function FormularioEliminar() {
  const [confirmacion, setConfirmacion] = useState("");
  const [estado, accion, pendiente] = useActionState(eliminarCuentaAction, ESTADO_INICIAL);
  const ok = confirmacion.trim().toUpperCase() === PALABRA_CONFIRMACION;

  return (
    <form action={accion} className="flex flex-col gap-5">
      <div>
        <label htmlFor="confirmacion" className="block px-1 pb-2 text-[13px] font-semibold text-slate-brand">
          Para confirmar, escribí <span className="font-extrabold text-foreground">{PALABRA_CONFIRMACION}</span>
        </label>
        <input
          id="confirmacion"
          name="confirmacion"
          value={confirmacion}
          onChange={(e) => setConfirmacion(e.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          placeholder={PALABRA_CONFIRMACION}
          className={cn(
            "w-full rounded-[var(--radius-item)] border-[1.5px] bg-card px-4 py-[15px] text-base font-bold tracking-[0.06em] outline-none",
            ok ? "border-destructive" : "border-foreground/15"
          )}
        />
      </div>

      {estado.status === "error" && <p className="rounded-[14px] bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">{estado.mensaje}</p>}

      <button
        type="submit"
        disabled={!ok || pendiente}
        className={cn(
          "rounded-full py-[15px] text-[14.5px] font-extrabold text-primary-foreground transition-colors",
          ok ? "bg-destructive" : "bg-destructive/40"
        )}
      >
        {pendiente ? "Eliminando…" : "Eliminar mi cuenta"}
      </button>
    </form>
  );
}
