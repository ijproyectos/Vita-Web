// Feedback instantáneo de navegación: sin este archivo, Next 16 no hace
// prefetch de las páginas dinámicas de /app/* y el toque "no pasa nada"
// hasta que responde el servidor (~1,2 s medidos en producción), por eso el
// usuario volvía a tocar. Con loading.tsx el shell se prefetchea y la
// transición es inmediata.
export default function CargandoApp() {
  return (
    <div role="status" aria-label="Cargando" className="px-[18px] pt-1.5">
      <div className="mt-1.5 flex items-center gap-3">
        <div className="size-10 animate-pulse rounded-full bg-muted motion-reduce:animate-none" />
        <div className="h-6 w-40 animate-pulse rounded-full bg-muted motion-reduce:animate-none" />
      </div>
      <div className="mt-6 space-y-3">
        <div className="h-28 animate-pulse rounded-[var(--radius-card)] bg-muted motion-reduce:animate-none" />
        <div className="h-20 animate-pulse rounded-[var(--radius-card)] bg-muted motion-reduce:animate-none" />
        <div className="h-20 animate-pulse rounded-[var(--radius-card)] bg-muted motion-reduce:animate-none" />
      </div>
    </div>
  );
}
