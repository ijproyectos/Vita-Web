"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { invitarCuidadorAction, type EstadoAccion } from "./actions";

const ESTADO_INICIAL: EstadoAccion = { status: "idle" };

// Form de invitación — un solo campo (email), sin envío de correo: la
// decisión confirmada es que el elder comparte el link a mano (ver
// `invitar()` en lib/cuidadores/nucleo.ts).
export function InvitarCuidadorForm() {
  const [email, setEmail] = useState("");

  async function accion(prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
    const resultado = await invitarCuidadorAction(prev, formData);
    if (resultado.status === "success") {
      toast.success("Invitación creada");
      setEmail("");
    }
    return resultado;
  }

  const [estado, formAction, pendiente] = useActionState(accion, ESTADO_INICIAL);

  return (
    <form action={formAction} className="flex flex-col gap-2.5 rounded-[20px] bg-card p-4 shadow-[var(--shadow-card,0_8px_24px_rgba(15,33,54,0.06))]">
      <div className="font-heading text-[15px] font-bold">Invitar a un cuidador</div>
      <p className="-mt-1 text-xs text-muted-foreground">
        Le vas a poder compartir un link de invitación una vez creada.
      </p>
      <div className="flex items-stretch gap-2">
        <input
          name="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email@ejemplo.com"
          className="min-w-0 flex-1 rounded-[20px] bg-secondary px-3.5 py-3 text-sm font-medium outline-none"
        />
        <button
          type="submit"
          disabled={!email.trim() || pendiente}
          className="shrink-0 rounded-full bg-primary px-4.5 py-3 font-heading text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          {pendiente ? "Enviando…" : "Invitar"}
        </button>
      </div>
      {estado.status === "error" && (
        <p className="rounded-[14px] bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">{estado.message}</p>
      )}
    </form>
  );
}
