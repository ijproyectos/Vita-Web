import Link from "next/link";
import { VitaIcon } from "@/lib/vita-icons";
import { diaYMes } from "@/lib/rutina/formato";
import type { Turno } from "@/lib/turnos/tipos";

const TINTES = ["#0891b2", "#7c3aed", "#f59e0b"];

// Tarjeta de turno para el scroll horizontal de Home — porta TurnoCard de
// HomeScreen.jsx.
export function TurnoCard({ turno, indice }: { turno: Turno; indice: number }) {
  const { dia, mes } = diaYMes(turno.fecha);
  const tinte = TINTES[indice % TINTES.length];

  return (
    <Link
      href="/app/rutina"
      className="relative w-[200px] shrink-0 rounded-[20px] bg-card p-3.5 pl-[18px] shadow-[var(--shadow-card,0_8px_24px_rgba(15,33,54,0.06))]"
    >
      <span className="absolute inset-y-4 left-2 w-[3px] rounded-full" style={{ background: tinte }} />
      <div className="font-heading text-[15px] font-bold">{turno.especialidad}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{turno.profesional ?? turno.lugar ?? ""}</div>
      <div className="mt-2.5 flex items-center gap-2">
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-foreground">
          {dia} {mes}
        </span>
        <span className="text-xs font-semibold text-muted-foreground">{turno.hora} hs</span>
      </div>
    </Link>
  );
}

export function AgregarTurnoCard() {
  return (
    <Link
      href="/app/agregar-turno"
      className="flex min-h-[86px] w-[120px] shrink-0 flex-col items-center justify-center gap-1.5 rounded-[20px] bg-secondary text-muted-foreground"
    >
      <VitaIcon name="plus" size={22} />
      <span className="text-xs font-semibold">Agregar</span>
    </Link>
  );
}
