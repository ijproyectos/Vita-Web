import { Bloque, Cargando, EsqueletoFilas } from "@/components/vita/esqueletos";

// Perfil: tarjeta de cabecera (avatar + nombre + estadísticas) y los grupos de filas.
export default function CargandoPerfil() {
  return (
    <Cargando>
      <div className="mt-1.5 flex flex-col items-center gap-3 rounded-[var(--radius-card)] bg-card px-4 py-6 shadow-card">
        <Bloque className="size-20 rounded-full" />
        <Bloque className="h-5 w-40 rounded-full" />
        <div className="flex w-full justify-center gap-6 pt-2">
          <Bloque className="h-10 w-20 rounded-[var(--radius-item)]" />
          <Bloque className="h-10 w-20 rounded-[var(--radius-item)]" />
        </div>
      </div>
      <div className="mt-6 space-y-5">
        <EsqueletoFilas filas={3} />
        <EsqueletoFilas filas={3} />
      </div>
    </Cargando>
  );
}
