"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { VitaIcon } from "@/lib/vita-icons";
import { cn } from "@/lib/utils";
import type { VinculoCuidador } from "@/lib/cuidadores/tipos";
import { revocarCuidadorAction } from "./actions";

const BADGE: Record<VinculoCuidador["estado"], { label: string; clases: string }> = {
  pendiente: { label: "Pendiente", clases: "bg-chip-amber-bg text-chip-amber-ink" },
  aceptado: { label: "Aceptado", clases: "bg-chip-teal-bg text-chip-teal-ink" },
  revocado: { label: "Revocado", clases: "bg-chip-slate-bg text-chip-slate-ink" },
};

// Fila de "Mis cuidadores" — el link de invitación (`/cuidar/invitacion/{token}`)
// solo se muestra mientras el vínculo sigue `pendiente`; una vez aceptado o
// revocado el token ya no sirve para nada. `window.location.origin` en vez
// de una env var: mismo criterio que login-form.tsx (armar la URL de
// callback de Google), acá no hay ningún flujo server-side que necesite
// conocer el dominio de antemano.
export function VinculoRow({ vinculo }: { vinculo: VinculoCuidador }) {
  const [copiado, setCopiado] = useState(false);
  const [pendiente, startTransition] = useTransition();
  const badge = BADGE[vinculo.estado];

  function copiarLink() {
    const url = `${window.location.origin}/cuidar/invitacion/${vinculo.token}`;
    navigator.clipboard.writeText(url).then(
      () => {
        setCopiado(true);
        toast.success("Link copiado");
        setTimeout(() => setCopiado(false), 2000);
      },
      () => toast.error("No se pudo copiar el link")
    );
  }

  function revocar() {
    startTransition(async () => {
      await revocarCuidadorAction(vinculo.id);
      toast.success("Invitación revocada");
    });
  }

  return (
    <div className="flex flex-col gap-2.5 border-b px-4.5 py-3.5 last:border-b-0">
      <div className="flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
          <VitaIcon name="user" size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{vinculo.email_invitado}</div>
          <div className="mt-0.5 text-[11.5px] text-muted-foreground">
            {vinculo.estado === "pendiente" && `Vence ${new Date(vinculo.expira_at).toLocaleDateString("es-AR")}`}
            {vinculo.estado === "aceptado" && vinculo.aceptado_at &&
              `Desde ${new Date(vinculo.aceptado_at).toLocaleDateString("es-AR")}`}
            {vinculo.estado === "revocado" && "Ya no tiene acceso"}
          </div>
        </div>
        <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold", badge.clases)}>
          {badge.label}
        </span>
      </div>

      {vinculo.estado === "pendiente" && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={copiarLink}
            className="flex flex-1 items-center gap-2 rounded-[14px] bg-secondary px-3 py-2 text-left text-xs font-semibold text-primary"
          >
            <VitaIcon name={copiado ? "check" : "link"} size={15} />
            {copiado ? "Copiado" : "Copiar link de invitación"}
          </button>
          <button
            type="button"
            onClick={revocar}
            disabled={pendiente}
            aria-label="Revocar invitación"
            className="flex size-9 shrink-0 items-center justify-center rounded-[14px] bg-destructive/10 text-destructive disabled:opacity-50"
          >
            <VitaIcon name="trash" size={16} />
          </button>
        </div>
      )}

      {vinculo.estado === "aceptado" && (
        <button
          type="button"
          onClick={revocar}
          disabled={pendiente}
          className="self-start rounded-[14px] bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive disabled:opacity-50"
        >
          Revocar acceso
        </button>
      )}
    </div>
  );
}
