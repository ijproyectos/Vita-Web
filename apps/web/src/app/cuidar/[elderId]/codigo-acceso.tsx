"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { VitaIcon } from "@/lib/vita-icons";
import { generarCodigoAccesoAction } from "./actions";

export function CodigoAcceso({ elderId }: { elderId: string }) {
  const [pendiente, startTransition] = useTransition();
  const [codigo, setCodigo] = useState<string | null>(null);

  function generar() {
    startTransition(async () => {
      try {
        const r = await generarCodigoAccesoAction(elderId);
        if (r.status === "success") {
          setCodigo(r.codigo);
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
      <div className="font-heading text-[15px] font-bold">Código para que entre de nuevo</div>
      <p className="mt-1 text-[12.5px] text-muted-foreground">
        Si cambió de celular o se cerró su sesión, generá un código y pasáselo.
      </p>

      {codigo && (
        <div className="mt-3 rounded-[16px] bg-secondary px-4 py-4 text-center">
          <div className="font-heading text-[34px] font-extrabold tracking-[0.3em] text-primary" aria-live="polite">
            {codigo}
          </div>
          <p className="mt-2 text-[12px] text-muted-foreground">
            Se lo dictás o se lo mandás por WhatsApp. Vence en 15 minutos y sirve una sola vez.
          </p>
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
