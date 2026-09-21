"use client";

import { useActionState } from "react";
import { VitaIcon } from "@/lib/vita-icons";
import { aceptarInvitacionAction, type EstadoAceptarInvitacion } from "./actions";

const ESTADO_INICIAL: EstadoAceptarInvitacion = { status: "idle" };

// Botón "Aceptar" explícito — nunca se reclama la invitación en el GET de
// la página (un prefetch/precarga del link no debe consumir un token de
// un solo uso). El éxito hace `redirect("/cuidar")` desde la propia
// Server Action; acá solo se maneja el caso de error.
export function AceptarInvitacionForm({ token }: { token: string }) {
  const [estado, formAction, pendiente] = useActionState(aceptarInvitacionAction, ESTADO_INICIAL);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="token" value={token} />

      {estado.status === "error" && (
        <div className="flex items-start gap-2.5 rounded-[16px] bg-destructive/10 px-3.5 py-3 text-sm text-destructive">
          <VitaIcon name="alert-triangle" size={18} className="mt-0.5 shrink-0" />
          <span>{estado.mensaje}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={pendiente}
        className="rounded-full bg-gradient-to-br from-[#22d3ee] to-[#0e7490] py-3.5 font-heading text-sm font-extrabold text-white shadow-[0_10px_24px_rgba(8,145,178,0.35)] disabled:opacity-60"
      >
        {pendiente ? "Aceptando…" : "Aceptar invitación"}
      </button>
    </form>
  );
}
