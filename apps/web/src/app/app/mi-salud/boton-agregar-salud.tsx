"use client";

import { useState } from "react";
import { VitaIcon } from "@/lib/vita-icons";
import { AgregarSheet } from "../rutina/agregar-sheet";

// "+" de Mi Salud: hoja "Agregar a tu salud" con Estudio, Cargar una medición
// y Pedírselo a vita.
export function BotonAgregarSalud({ nombrePersona }: { nombrePersona?: string | null }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label="Agregar a la salud"
        className="flex size-[42px] shrink-0 items-center justify-center rounded-full bg-card text-foreground shadow-card transition-transform active:scale-[0.94] motion-reduce:transition-none"
      >
        <VitaIcon name="plus" size={20} strokeWidth={2} />
      </button>
      <AgregarSheet open={abierto} onOpenChange={setAbierto} nombrePersona={nombrePersona} tipo="salud" />
    </>
  );
}
