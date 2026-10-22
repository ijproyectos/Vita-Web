"use client";

import Link from "next/link";
import { VitaIcon } from "@/lib/vita-icons";
import { etiquetaDia } from "@/lib/rutina/formato";
import { iconoDeEspecialidad, tonoDeTurno } from "@/lib/turnos/icono";
import type { Turno } from "@/lib/turnos/tipos";

// Tarjeta de turno para el scroll horizontal de Home (V7): borde izquierdo de
// color, ícono de la especialidad, chip de día y hora.
export function TurnoCard({ turno, indice, onAbrir }: { turno: Turno; indice: number; onAbrir: () => void }) {
  const tono = tonoDeTurno(turno.especialidad, indice);

  return (
    <button
      type="button"
      onClick={onAbrir}
      className="relative w-[196px] shrink-0 rounded-[18px] bg-card py-3.5 pl-[18px] pr-3.5 text-left shadow-card"
    >
      <span className="absolute inset-y-4 left-2 w-[3px] rounded-full" style={{ background: tono }} />
      <span style={{ color: tono }}>
        <VitaIcon name={iconoDeEspecialidad(turno.especialidad)} size={18} />
      </span>
      <div className="mt-2 truncate font-heading text-[14.5px] font-extrabold tracking-[-0.02em]">{turno.especialidad}</div>
      <div className="mt-0.5 truncate text-[11.5px] font-medium text-subtle">
        {turno.profesional ?? turno.lugar ?? " "}
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        <span className="rounded-full bg-canvas px-2.5 py-1 text-[11.5px] font-bold tabular-nums text-slate-brand">
          {etiquetaDia(turno.fecha)}
        </span>
        <span className="text-[11.5px] font-bold tabular-nums text-subtle">{turno.hora} hs</span>
      </div>
    </button>
  );
}

export function AgregarTurnoCard() {
  return (
    <Link
      href="/app/agregar-turno"
      className="flex min-h-[110px] w-[112px] shrink-0 flex-col items-center justify-center gap-1.5 rounded-[18px] border-[1.5px] border-dashed border-foreground/15 text-subtle"
    >
      <VitaIcon name="plus" size={20} />
      <span className="text-[11.5px] font-bold">Agregar</span>
    </Link>
  );
}
