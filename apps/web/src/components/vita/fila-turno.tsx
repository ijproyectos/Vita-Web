import type { ReactNode } from "react";
import { VitaIcon } from "@/lib/vita-icons";
import { diaYMes } from "@/lib/rutina/formato";
import { lineasDeTurno, type TurnoParaTarjeta } from "@/lib/turnos/formato";

// Una fila por turno para resúmenes y revisiones (onboarding): día en un
// recuadro, especialidad, fecha en palabras con la hora y el lugar en su
// propia línea. Todo envuelve (`break-words`, `min-w-0`): con varios turnos
// cada uno es su propia fila y nada se corta ni se desborda a 360 px.
export function FilaTurno({ turno, anioActual, accion }: { turno: TurnoParaTarjeta; anioActual?: number; accion?: ReactNode }) {
  const { titulo, dia: diaTexto, hora, donde } = lineasDeTurno(turno, anioActual);
  const { dia, mes } = diaYMes(turno.fecha);
  return (
    <div className="flex items-start gap-3 rounded-[var(--radius-item)] bg-secondary p-3">
      <div className="flex w-12 shrink-0 flex-col items-center rounded-[14px] bg-card py-1.5 shadow-item" aria-hidden="true">
        <span className="font-heading text-[18px] font-extrabold leading-none">{dia}</span>
        <span className="mt-0.5 text-[10px] font-extrabold tracking-wide text-subtle">{mes}</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="break-words font-heading text-[14.5px] font-extrabold leading-snug">{titulo}</div>
        <div className="break-words text-[12.5px] font-semibold text-slate-brand">{diaTexto}</div>
        <div className="flex items-center gap-1 text-[12.5px] font-semibold text-slate-brand">
          <VitaIcon name="clock" size={12} className="shrink-0" />
          <span>{hora}</span>
        </div>
        {donde && (
          <div className="flex items-start gap-1 text-[12px] font-medium text-subtle">
            <VitaIcon name="location" size={12} className="mt-[3px] shrink-0" />
            <span className="min-w-0 break-words">{donde}</span>
          </div>
        )}
      </div>
      {accion}
    </div>
  );
}
