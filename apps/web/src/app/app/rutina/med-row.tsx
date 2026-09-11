import { VitaIcon } from "@/lib/vita-icons";
import { CheckToggle } from "./check-toggle";
import type { ColorChip } from "@/lib/perfil/tipos";
import type { MedicamentoConToma } from "@/lib/medicamentos/tipos";
import { cn } from "@/lib/utils";

const TINTE_BG: Record<ColorChip, string> = {
  teal: "bg-chip-teal-bg text-chip-teal-ink",
  violet: "bg-chip-violet-bg text-chip-violet-ink",
  amber: "bg-chip-amber-bg text-chip-amber-ink",
  rose: "bg-chip-rose-bg text-chip-rose-ink",
};

// Fila de medicamento de la lista "Medicamentos de hoy" — porta MedRow de
// HomeScreen.jsx.
export function MedRow({
  med,
  color,
  divider,
}: {
  med: MedicamentoConToma;
  color: ColorChip;
  divider: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-3 px-2.5 py-2.5", divider && "border-b")}>
      <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-full", TINTE_BG[color])}>
        <VitaIcon name="pill" size={19} />
      </div>
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "truncate font-heading text-[14.5px] font-bold transition-opacity",
            med.tomado && "text-decoration-line-through opacity-55 line-through"
          )}
        >
          {med.nombre}
        </div>
        <div className={cn("text-xs text-muted-foreground", med.tomado && "opacity-60")}>
          {med.dosis ? `${med.dosis} · ` : ""}
          {med.hora_programada} hs
        </div>
      </div>
      <CheckToggle medicamentoId={med.id} tomadoInicial={med.tomado} />
    </div>
  );
}
