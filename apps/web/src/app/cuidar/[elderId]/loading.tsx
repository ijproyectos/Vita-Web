import { Bloque, Cargando, EsqueletoEncabezado, EsqueletoFilas } from "@/components/vita/esqueletos";

// Ficha de una persona cuidada: encabezado, adherencia de hoy y la lista de tomas.
export default function CargandoElder() {
  return (
    <Cargando>
      <EsqueletoEncabezado />
      <Bloque className="mt-5 h-24 rounded-[var(--radius-card)]" />
      <EsqueletoFilas filas={4} className="mt-4" />
    </Cargando>
  );
}
