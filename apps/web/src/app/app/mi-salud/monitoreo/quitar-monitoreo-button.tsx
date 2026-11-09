"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { quitarMonitoreoAction } from "./actions";

/** "Dejar de avisar": borra el plan; las mediciones ya cargadas quedan. */
export function QuitarMonitoreoButton({ monitoreoId }: { monitoreoId: string }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [pendiente, iniciar] = useTransition();

  // Sin botón "No": la confirmación se cae sola si no se toca de nuevo.
  useEffect(() => {
    if (!confirmando) return;
    const t = setTimeout(() => setConfirmando(false), 5000);
    return () => clearTimeout(t);
  }, [confirmando]);

  if (!confirmando) {
    return (
      <button type="button" onClick={() => setConfirmando(true)} className="text-[13px] font-bold text-destructive">
        Dejar de avisar
      </button>
    );
  }
  return (
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
  );
}
