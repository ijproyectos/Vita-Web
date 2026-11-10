"use client";

import { BarraInferior, Cabecera, TarjetaGrupo, TarjetaSiguientes, type Dosis, type Siguiente } from "@/components/vita/modo-simple/piezas";

// Pantalla principal del modo simple con datos de ejemplo y botones inertes (solo para capturas).
const nada = () => {};

export function VistaPreviaModoSimple({ grupo, siguientes, alertado }: { grupo: Dosis[]; siguientes: Siguiente[]; alertado: boolean }) {
  return (
    <>
      <div className="flex-1 overflow-y-auto px-5 pb-[168px] pt-5">
        <Cabecera saludo="Buen día" nombre="Elsa" fechaTexto="martes 10 de noviembre" telefono="1155555555" contacto="Martina" onAyuda={nada} />
        <div className="mt-5 flex flex-col gap-4">
          <TarjetaGrupo
            grupo={grupo}
            momento="mañana"
            alertado={alertado}
            confirmando={false}
            escuchandoVoz={false}
            silenciada
            onConfirmar={nada}
            onEscuchar={nada}
            onPosponer={nada}
            onAlternarVoz={nada}
          />
          {siguientes.length > 0 && <TarjetaSiguientes siguientes={siguientes} />}
        </div>
      </div>
      <BarraInferior estado="idle" onHablar={nada} onAjustes={nada} />
    </>
  );
}
