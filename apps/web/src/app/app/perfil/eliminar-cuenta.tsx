"use client";

import { useActionState, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { VitaIcon } from "@/lib/vita-icons";
import { PALABRA_CONFIRMACION, type EstadoEliminarCuenta } from "@/lib/cuenta/tipos";
import { eliminarCuentaAction } from "./actions";

const ESTADO_INICIAL: EstadoEliminarCuenta = { status: "idle" };

// Fila "Eliminar mi cuenta" de Privacidad y datos + sheet de confirmación.
// Pide escribir una palabra (no solo un botón) porque la baja es
// irreversible y borra todo: medicamentos, turnos, estudios, chat y
// vínculos de cuidado.
export function EliminarCuenta() {
  const [abierto, setAbierto] = useState(false);
  const [confirmacion, setConfirmacion] = useState("");
  const [estado, accion, pendiente] = useActionState(eliminarCuentaAction, ESTADO_INICIAL);

  const habilitado = confirmacion.trim().toUpperCase() === PALABRA_CONFIRMACION && !pendiente;

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="flex w-full items-center gap-3 border-t border-foreground/[0.06] px-4 py-3.5 text-left"
      >
        <div className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-tile)] bg-chip-rose-bg text-chip-rose-ink">
          <VitaIcon name="trash" size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-heading text-[14.5px] font-extrabold tracking-[-0.02em] text-destructive">Eliminar mi cuenta</div>
          <div className="mt-0.5 text-[11.5px] font-medium text-subtle">Borra tu perfil y todos tus datos</div>
        </div>
        <VitaIcon name="chevron-right" size={18} className="shrink-0 text-faint" />
      </button>

      <Sheet
        open={abierto}
        onOpenChange={(v) => {
          setAbierto(v);
          if (!v) setConfirmacion("");
        }}
      >
        <SheetContent side="bottom" className="rounded-t-[28px] pb-8">
          <SheetHeader>
            <SheetTitle>¿Eliminar tu cuenta?</SheetTitle>
            <SheetDescription>Esta acción no se puede deshacer.</SheetDescription>
          </SheetHeader>

          <form action={accion} className="flex flex-col gap-3.5 px-4">
            <div className="rounded-[20px] bg-destructive/10 p-3.5 text-[13px] leading-snug text-foreground">
              Se borran para siempre tu perfil de salud, medicamentos y su historial de tomas, turnos, estudios y
              sus fotos, conversaciones con vita y los vínculos con tus cuidadores o con las personas que cuidás. Tu
              cuenta de Google queda desconectada de vita.
            </div>

            <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
              Escribí {PALABRA_CONFIRMACION} para confirmar
              <input
                name="confirmacion"
                value={confirmacion}
                onChange={(e) => setConfirmacion(e.target.value)}
                autoComplete="off"
                autoCapitalize="characters"
                className="h-12 rounded-full bg-card px-4 text-sm font-normal shadow-outline-soft"
              />
            </label>

            {estado.status === "error" && (
              <p className="rounded-[14px] bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">{estado.mensaje}</p>
            )}

            <button
              type="submit"
              disabled={!habilitado}
              className="h-12 rounded-full bg-destructive font-heading text-[15px] font-bold text-primary-foreground disabled:opacity-50"
            >
              {pendiente ? "Eliminando…" : "Eliminar mi cuenta para siempre"}
            </button>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}
