// Piezas de esqueleto para los `loading.tsx` de cada ruta: mismo ritmo y radios que la pantalla real, para que el
// cambio al contenido no salte. Server Components sin estado; los colores salen de tokens (bg-muted).

const BASE = "animate-pulse bg-muted motion-reduce:animate-none";

export function Bloque({ className }: { className: string }) {
  return <div aria-hidden className={`${BASE} ${className}`} />;
}

/** Encabezado de pantalla: círculo (volver o avatar) + título. */
export function EsqueletoEncabezado({ conCirculo = true }: { conCirculo?: boolean }) {
  return (
    <div className="mt-1.5 flex items-center gap-3">
      {conCirculo ? <Bloque className="size-10 rounded-full" /> : null}
      <Bloque className="h-6 w-40 rounded-full" />
    </div>
  );
}

/** Lista de filas dentro de una tarjeta. */
export function EsqueletoFilas({ filas, className = "" }: { filas: number; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-[var(--radius-card)] bg-card shadow-card ${className}`}>
      {Array.from({ length: filas }, (_, i) => (
        <div key={i} className={`flex items-center gap-3 px-4 py-3.5 ${i > 0 ? "border-t border-foreground/[0.06]" : ""}`}>
          <Bloque className="size-10 shrink-0 rounded-[var(--radius-tile)]" />
          <div className="flex-1 space-y-2">
            <Bloque className="h-3.5 w-3/5 rounded-full" />
            <Bloque className="h-3 w-2/5 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function Cargando({ children, className = "px-[18px] pt-1.5" }: { children: React.ReactNode; className?: string }) {
  return (
    <div role="status" aria-label="Cargando" className={className}>
      {children}
    </div>
  );
}
