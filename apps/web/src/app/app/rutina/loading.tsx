import { Bloque, Cargando, EsqueletoFilas } from "@/components/vita/esqueletos";

// Rutina: título + selector Hoy/Próximos/Historial + tomas agrupadas por momento del día.
export default function CargandoRutina() {
  return (
    <Cargando>
      <div className="mt-1.5 flex items-center justify-between">
        <Bloque className="h-7 w-32 rounded-full" />
        <Bloque className="size-10 rounded-full" />
      </div>
      <Bloque className="mt-4 h-11 w-full rounded-full" />
      <div className="mt-6 space-y-5">
        <div className="space-y-2.5">
          <Bloque className="h-3 w-20 rounded-full" />
          <EsqueletoFilas filas={2} />
        </div>
        <div className="space-y-2.5">
          <Bloque className="h-3 w-24 rounded-full" />
          <EsqueletoFilas filas={2} />
        </div>
      </div>
    </Cargando>
  );
}
