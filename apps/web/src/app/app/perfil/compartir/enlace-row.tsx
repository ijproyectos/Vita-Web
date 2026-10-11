"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { EnlaceProfesional } from "@/lib/compartir/tipos";
import { revocarEnlaceAction } from "./actions";

const BADGE: Record<EnlaceProfesional["estado"], { label: string; clases: string }> = {
  activo: { label: "Activo", clases: "bg-chip-teal-bg text-chip-teal-ink" },
  vencido: { label: "Vencido", clases: "bg-chip-amber-bg text-chip-amber-ink" },
  revocado: { label: "Revocado", clases: "bg-chip-slate-bg text-chip-slate-ink" },
};

function fecha(iso: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date(iso));
}

export function EnlaceRow({ enlace }: { enlace: EnlaceProfesional }) {
  const [pendiente, startTransition] = useTransition();
  const badge = BADGE[enlace.estado];

  function revocar() {
    startTransition(async () => {
      const r = await revocarEnlaceAction(enlace.id);
      if (r.status === "success") toast.success("Link revocado");
      else toast.error(r.message);
    });
  }

  return (
    <div className="flex flex-col gap-2 border-b px-4.5 py-3.5 last:border-b-0">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{enlace.etiqueta ?? "Link sin nombre"}</div>
          <div className="mt-0.5 text-[11.5px] text-muted-foreground">
            {enlace.estado === "activo" && `Vence ${fecha(enlace.expira_at)}`}
            {enlace.estado === "vencido" && `Venció ${fecha(enlace.expira_at)}`}
            {enlace.estado === "revocado" && enlace.revocado_at && `Revocado ${fecha(enlace.revocado_at)}`}
          </div>
          <div className="mt-0.5 text-[11.5px] text-muted-foreground">
            {enlace.accesos === 1 ? "1 visita" : `${enlace.accesos} visitas`}
            {enlace.ultimo_acceso_at && ` · última ${fecha(enlace.ultimo_acceso_at)}`}
          </div>
        </div>
        <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold", badge.clases)}>
          {badge.label}
        </span>
      </div>
      {enlace.estado === "activo" && (
        <button
          type="button"
          onClick={revocar}
          disabled={pendiente}
          className="self-start rounded-[14px] bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive disabled:opacity-50"
        >
          {pendiente ? "Revocando…" : "Revocar"}
        </button>
      )}
    </div>
  );
}
