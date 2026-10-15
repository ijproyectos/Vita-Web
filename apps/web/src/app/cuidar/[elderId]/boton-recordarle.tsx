"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { VitaIcon } from "@/lib/vita-icons";
import { recordarleAction } from "./actions";

export function BotonRecordarle({ elderId, medicamentoId }: { elderId: string; medicamentoId: string }) {
  const [pendiente, startTransition] = useTransition();

  function recordar() {
    startTransition(async () => {
      try {
        const r = await recordarleAction(elderId, medicamentoId);
        switch (r.status) {
          case "enviado":
            toast.success("Le mandamos el recordatorio");
            break;
          case "repetido":
            toast.info("Ya le recordaste hace un rato");
            break;
          case "sin-avisos":
            toast.info("No tiene avisos activados en su celular. Probá con una llamada o un WhatsApp.");
            break;
          case "ya-tomada":
            toast.success("Ya la tomó");
            break;
          default:
            toast.error(r.message);
        }
      } catch {
        toast.error("No pudimos enviar el recordatorio. Probá de nuevo.");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={recordar}
      disabled={pendiente}
      className="mt-1.5 inline-flex min-h-8 items-center gap-1.5 rounded-full bg-secondary px-3 text-[12px] font-semibold text-primary disabled:opacity-60"
    >
      <VitaIcon name="bell" size={13} />
      {pendiente ? "Enviando…" : "Recordarle"}
    </button>
  );
}
