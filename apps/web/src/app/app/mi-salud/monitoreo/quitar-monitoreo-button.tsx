"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { quitarMonitoreoAction } from "./actions";

/** "Dejar de avisar": borra el plan; las mediciones ya cargadas quedan. */
export function QuitarMonitoreoButton({ monitoreoId }: { monitoreoId: string }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [pendiente, iniciar] = useTransition();

  if (!confirmando) {
    return (
      <button type="button" onClick={() => setConfirmando(true)} className="text-[13px] font-bold text-destructive">
        Dejar de avisar
      </button>
    );
  }
  return (
    <span className="flex items-center gap-3">
      <button type="button" onClick={() => setConfirmando(false)} className="text-[13px] font-bold text-slate-brand">
        No
      </button>
      <button
        type="button"
        disabled={pendiente}
        onClick={() =>
          iniciar(async () => {
            const r = await quitarMonitoreoAction(monitoreoId);
            if (r.status === "error") toast.error(r.message);
            else router.refresh();
          })
        }
        className="text-[13px] font-extrabold text-destructive disabled:opacity-60"
      >
        {pendiente ? "Quitando…" : "Sí, dejar de avisar"}
      </button>
    </span>
  );
}
