"use client";

import { BarraInferior, Cabecera, TarjetaGrupo, TarjetaHoy, type Dosis } from "@/components/vita/modo-simple/piezas";
import { AccesoRutinaCompleta } from "@/app/app/modo-simple/lista-hoy";
import type { FilaHoy } from "@/lib/modo-simple/seleccion";

// Pantalla principal del modo simple con datos de ejemplo y botones inertes (solo para capturas).
const nada = () => {};

export function VistaPreviaModoSimple({ grupo, filas, alertado, soloLista = false }: { grupo: Dosis[]; filas: FilaHoy[]; alertado: boolean; soloLista?: boolean }) {
  if (soloLista) {
    return (
      <div className="flex-1 overflow-y-auto px-5 pb-12 pt-5">
        <h1 className="font-heading text-[32px] font-extrabold tracking-[-0.035em]">Tu rutina de hoy</h1>
        <div className="mt-5">
          <TarjetaHoy filas={filas} onTocar={nada} />
        </div>
      </div>
    );
  }
  return (
    <>
      <div className="flex-1 overflow-y-auto px-5 pb-[168px] pt-5">
        <Cabecera saludo="Buen día" nombre="Elsa" fechaTexto="martes 10 de noviembre" telefono="1155555555" contacto="Martina" onAyuda={nada} />
        <div className="mt-5 flex flex-col gap-4">
          <TarjetaGrupo
            grupo={grupo}
            momento="mediodia"
            alertado={alertado}
            confirmando={false}
            escuchandoVoz={false}
            silenciada
            onConfirmar={nada}
            onEscuchar={nada}
            onPosponer={nada}
            onAlternarVoz={nada}
            onNoTome={nada}
          />
          <AccesoRutinaCompleta filas={filas} />
        </div>
      </div>
      <BarraInferior estado="idle" onHablar={nada} onAjustes={nada} />
    </>
  );
}
