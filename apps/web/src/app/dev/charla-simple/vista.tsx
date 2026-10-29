"use client";

import { CharlaSimple, type VistaInicialCharla } from "@/app/app/modo-simple/charla-simple";
import { PREFS_POR_DEFECTO } from "@/lib/modo-simple/tipos";
import type { MedHoy, TurnoProximo } from "@/lib/modo-simple/respuestas";

// Cliente: `onCerrar` es una función y no puede cruzar la frontera desde el Server Component.
export function VistaPrevia({ medsHoy, turnoProximo, inicial }: { medsHoy: MedHoy[]; turnoProximo: TurnoProximo; inicial: VistaInicialCharla }) {
  return <CharlaSimple nombre="Elsa" config={PREFS_POR_DEFECTO} medsHoy={medsHoy} turnoProximo={turnoProximo} onCerrar={() => {}} inicial={inicial} />;
}
