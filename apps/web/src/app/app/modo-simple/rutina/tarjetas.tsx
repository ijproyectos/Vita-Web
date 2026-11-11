"use client";

import { TarjetaMediciones, TarjetaTurno, type MedicionSimple } from "@/components/vita/modo-simple/piezas";
import { esTipoMedicion, hrefNuevaMedicion } from "@/lib/mediciones/tipos";
import { RUTA_RUTINA_SIMPLE } from "../lista-hoy";

export { TarjetaTurno };

/** Las mediciones de hoy con su enlace para cargar (vuelve a esta pantalla). */
export function TarjetaMedicionesEnlace({ titulo, mediciones }: { titulo: string; mediciones: MedicionSimple[] }) {
  return (
    <TarjetaMediciones
      titulo={titulo}
      mediciones={mediciones}
      hrefDe={(tipo) => hrefNuevaMedicion({ tipo: esTipoMedicion(tipo) ? tipo : undefined, volver: RUTA_RUTINA_SIMPLE, ahora: true })}
    />
  );
}
