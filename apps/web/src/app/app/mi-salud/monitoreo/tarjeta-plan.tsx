import Link from "next/link";
import { fechaHoyAR, resumenCuando } from "@/lib/medicamentos/cuando";
import type { Monitoreo } from "@/lib/mediciones/plan";
import { QuitarMonitoreoButton } from "./quitar-monitoreo-button";

/** Horarios de un monitoreo, con "Cambiar horarios" y "Dejar de avisar". */
export function TarjetaPlan({ plan, puedeEditar, hrefCambiar }: { plan: Monitoreo; puedeEditar: boolean; hrefCambiar: string }) {
  return (
    <div className="rounded-[20px] bg-card p-[18px] shadow-card">
      <div className="eyebrow text-subtle">Te aviso</div>
      <div className="mt-1.5 font-heading text-[15px] font-extrabold tabular-nums tracking-[-0.02em]">
        {plan.horarios.map((h) => h.hora).join(" · ")}
      </div>
      <div className="mt-0.5 text-[12.5px] font-medium text-slate-brand">
        {resumenCuando({ dias: plan.dias_recurrentes, hasta: plan.fecha_fin ? "fecha" : "siempre", fechaElegida: plan.fecha_fin ?? "" }, fechaHoyAR())}
      </div>
      {puedeEditar && (
        <div className="mt-3.5 flex items-center justify-between gap-2.5 border-t border-foreground/[0.06] pt-3">
          <Link href={hrefCambiar} className="text-[13px] font-bold text-teal-deep">
            Cambiar horarios
          </Link>
          <QuitarMonitoreoButton monitoreoId={plan.id} />
        </div>
      )}
    </div>
  );
}
