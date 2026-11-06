import { Bloque, Cargando, EsqueletoFilas } from "@/components/vita/esqueletos";

// Mi Salud: título, tarjeta "Mi estado", chips de filtro y el feed de registros.
export default function CargandoMiSalud() {
  return (
    <Cargando>
      <div className="mt-1.5 flex items-center justify-between">
        <Bloque className="h-7 w-28 rounded-full" />
        <Bloque className="size-10 rounded-full" />
      </div>
      <Bloque className="mt-5 h-24 w-full rounded-[var(--radius-card)]" />
      <div className="mt-5 flex gap-2">
        <Bloque className="h-9 w-20 rounded-full" />
        <Bloque className="h-9 w-24 rounded-full" />
        <Bloque className="h-9 w-24 rounded-full" />
      </div>
      <EsqueletoFilas filas={4} className="mt-4" />
    </Cargando>
  );
}
