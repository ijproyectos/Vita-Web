"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { VitaIcon } from "@/lib/vita-icons";
import { RUTA_MONITOREO, hrefNuevaMedicion, hrefNuevoMonitoreo } from "@/lib/mediciones/tipos";
import { Opcion } from "../../rutina/agregar-sheet";

// El "+" de Monitoreo activo: un valor suelto o un plan con avisos son cosas
// distintas, así que se elige antes de abrir cualquiera de los dos formularios.
export function BotonAgregarMonitoreo() {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label="Agregar"
        className="flex size-[42px] shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-cta-sm transition-transform active:scale-[0.94] motion-reduce:transition-none"
      >
        <VitaIcon name="plus" size={20} strokeWidth={2.4} />
      </button>
      <Sheet open={abierto} onOpenChange={setAbierto}>
        <SheetContent side="bottom" showCloseButton={false} className="gap-0 rounded-t-[28px] bg-card px-4 pb-[42px] pt-3.5">
          <div aria-hidden className="mx-auto mb-4 h-1 w-10 rounded bg-line-soft" />
          <SheetTitle className="px-1 font-heading text-lg font-extrabold tracking-[-0.02em]">¿Qué querés agregar?</SheetTitle>
          <SheetDescription className="px-1 pb-3.5 pt-1 text-[12.5px] font-medium text-subtle">
            Una medición se anota una vez. Un monitoreo te avisa cuándo medir.
          </SheetDescription>
          <div className="flex flex-col gap-[9px]">
            <Opcion
              icon="heart-plus"
              tinte="bg-chip-teal-bg text-chip-teal-ink"
              titulo="Cargar una medición"
              sub="Un valor que ya mediste"
              href={hrefNuevaMedicion({ volver: RUTA_MONITOREO })}
            />
            <Opcion
              icon="chart"
              tinte="bg-chip-violet-bg text-chip-violet-ink"
              titulo="Armar un monitoreo"
              sub="Qué medir, horarios y avisos"
              href={hrefNuevoMonitoreo({ volver: RUTA_MONITOREO })}
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
