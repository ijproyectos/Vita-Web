import { Bloque, Cargando, EsqueletoEncabezado } from "@/components/vita/esqueletos";

// Panel del cuidador: encabezado y una tarjeta por persona que cuida.
export default function CargandoCuidar() {
  return (
    <Cargando>
      <EsqueletoEncabezado conCirculo={false} />
      <div className="mt-6 space-y-3">
        <Bloque className="h-28 rounded-[var(--radius-card)]" />
        <Bloque className="h-28 rounded-[var(--radius-card)]" />
        <Bloque className="h-28 rounded-[var(--radius-card)]" />
      </div>
    </Cargando>
  );
}
