"use client";

import { useState } from "react";
import { TurnoCard, AgregarTurnoCard } from "./rutina/turno-card";
import { DetalleTurno } from "./rutina/detalle-turno";
import type { Turno } from "@/lib/turnos/tipos";
import type { PerfilActivo } from "@/lib/familia/tipos";

// Carrusel "Próximos turnos" de Home: cada tarjeta abre la misma hoja de
// detalle que la Rutina (día/hora, dónde, qué llevar, llamar, editar).
export function TurnosHome({ turnos, perfil, puedeEditar }: { turnos: Turno[]; perfil: PerfilActivo; puedeEditar: boolean }) {
  const [abierto, setAbierto] = useState<Turno | null>(null);
  return (
    <>
      <div className="-mx-[18px] flex gap-2.5 overflow-x-auto px-[18px] pb-1 [scrollbar-width:none]">
        {turnos.map((t, i) => (
          <TurnoCard key={t.id} turno={t} indice={i} onAbrir={() => setAbierto(t)} />
        ))}
        {puedeEditar && <AgregarTurnoCard />}
      </div>
      {abierto && <DetalleTurno key={abierto.id} turno={abierto} perfil={perfil} puedeEditar={puedeEditar} onCerrar={() => setAbierto(null)} />}
    </>
  );
}
