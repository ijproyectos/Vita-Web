"use client";

import { TarjetaMediciones, TarjetaTurno, type MedicionSimple } from "@/components/vita/modo-simple/piezas";
import { useState } from "react";
import { TecladoMedicion } from "../teclado-medicion";

export { TarjetaTurno };

/** Las últimas mediciones; tocar una abre el teclado grande (no el formulario normal). */
export function TarjetaMedicionesEnlace({ titulo, mediciones }: { titulo: string; mediciones: MedicionSimple[] }) {
  const [teclado, setTeclado] = useState<{ tipo: MedicionSimple["tipo"]; ultimo: string } | null>(null);
  return (
    <>
      <TarjetaMediciones
        titulo={titulo}
        mediciones={mediciones}
        onTocar={(tipo) => setTeclado({ tipo, ultimo: mediciones.find((m) => m.tipo === tipo)?.valor ?? "" })}
      />
      {teclado && <TecladoMedicion tipo={teclado.tipo} ultimo={teclado.ultimo || null} onCerrar={() => setTeclado(null)} />}
    </>
  );
}
