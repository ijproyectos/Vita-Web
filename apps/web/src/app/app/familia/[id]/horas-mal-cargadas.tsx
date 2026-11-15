"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { VitaIcon } from "@/lib/vita-icons";
import { cambiarPerfilActivoAction } from "../actions";

/**
 * Remedios con la hora mal cargada: no suenan ni aparecen en su modo simple.
 * "Corregir" abre sus medicamentos (con esa persona activa) para editarlos.
 * Solo para quien puede editar.
 */
export function HorasMalCargadas({ elderId, items }: { elderId: string; items: { id: string; nombre: string }[] }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();

  function corregir() {
    startTransition(async () => {
      try {
        const r = await cambiarPerfilActivoAction(elderId);
        if (r.status === "error") {
          toast.error(r.message);
          return;
        }
        router.push("/app/medicamentos");
      } catch {
        toast.error("No pudimos cambiar de perfil.");
      }
    });
  }

  return (
    <section>
      <h2 className="eyebrow flex items-center gap-1.5 px-1 pb-2.5 text-aviso-ink">
        <VitaIcon name="alert-triangle" size={14} strokeWidth={2.6} /> Hora mal cargada
      </h2>
      <ul className="overflow-hidden rounded-[20px] bg-aviso-panel shadow-card">
        {items.map((m) => (
          <li key={m.id} className="flex items-center gap-3 px-4 py-3.5 [&:not(:first-child)]:border-t [&:not(:first-child)]:border-foreground/[0.06]">
            <div className="min-w-0 flex-1">
              <div className="font-heading text-[16px] font-extrabold tracking-[-0.02em] text-aviso-panel-ink">{m.nombre} tiene la hora mal cargada</div>
              <div className="text-[13px] font-semibold text-aviso-panel-ink">No le llegan los avisos ni lo ve en su modo simple.</div>
            </div>
            <button
              type="button"
              onClick={corregir}
              disabled={pendiente}
              className="h-10 shrink-0 rounded-full bg-card px-4 text-[14px] font-extrabold text-aviso-panel-ink disabled:opacity-60"
            >
              Corregir
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
