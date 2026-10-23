"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { VitaIcon } from "@/lib/vita-icons";
import { PanelCodigoAcceso } from "@/components/vita/panel-codigo-acceso";
import { generarCodigoAccesoAction } from "./actions";

export function CodigoAcceso({
  elderId,
  nombre = "la persona",
  titulo = "Código para que entre de nuevo",
  descripcion = "Si cambió de celular o se cerró su sesión, generá un código y pasáselo.",
}: {
  elderId: string;
  nombre?: string;
  titulo?: string;
  descripcion?: string;
}) {
  const [pendiente, startTransition] = useTransition();
  const [codigo, setCodigo] = useState<{ codigo: string; expiraAt: string } | null>(null);

  function generar() {
    startTransition(async () => {
      try {
        const r = await generarCodigoAccesoAction(elderId);
        if (r.status === "success") {
          setCodigo({ codigo: r.codigo, expiraAt: r.expiraAt });
        } else {
          toast.error(r.message);
        }
      } catch {
        toast.error("No pudimos generar el código. Probá de nuevo.");
      }
    });
  }

  return (
    <div className="rounded-[20px] bg-card p-4.5 shadow-card">
      <div className="font-heading text-[15px] font-bold">{titulo}</div>
      <p className="mt-1 text-[12.5px] text-muted-foreground">{descripcion}</p>

      {codigo && (
        <div className="mt-3">
          <PanelCodigoAcceso codigo={codigo.codigo} expiraAt={codigo.expiraAt} nombre={nombre} />
        </div>
      )}

      <button
        type="button"
        onClick={generar}
        disabled={pendiente}
        className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-full bg-secondary px-4 text-[13px] font-semibold text-primary disabled:opacity-60"
      >
        <VitaIcon name="link" size={15} />
        {pendiente ? "Generando…" : codigo ? "Generar otro código" : "Generar código"}
      </button>
    </div>
  );
}
