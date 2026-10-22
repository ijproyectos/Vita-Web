"use client";

import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";

// "No pudimos guardar" (V7 ERROR AL GUARDAR): hoja de error de los formularios
// de alta/edición cuando el servidor no pudo guardar. Lo que el usuario cargó
// sigue en el formulario: "Reintentar" lo vuelve a enviar y "Descartar el
// cambio" lo abandona. `detalle` (opcional) muestra el motivo real.
export function ErrorGuardarSheet({
  abierto,
  detalle,
  reintentando,
  onReintentar,
  onDescartar,
  onCerrar,
}: {
  abierto: boolean;
  detalle?: string | null;
  reintentando?: boolean;
  onReintentar: () => void;
  /** Salir del cambio (volver atrás). */
  onDescartar: () => void;
  /** Cerrar la hoja sin descartar (tocar afuera): el formulario sigue ahí. Default: onDescartar. */
  onCerrar?: () => void;
}) {
  return (
    <Sheet open={abierto} onOpenChange={(v) => !v && (onCerrar ?? onDescartar)()}>
      <SheetContent side="bottom" showCloseButton={false} className="gap-3.5 rounded-t-[28px] bg-card px-5 pb-[34px] pt-6">
        <div className="flex size-12 items-center justify-center rounded-[15px] bg-destructive/10 text-[22px] font-extrabold text-destructive" aria-hidden>
          !
        </div>
        <div>
          <SheetTitle className="font-heading text-xl font-extrabold tracking-[-0.02em]">No pudimos guardar</SheetTitle>
          <SheetDescription className="mt-1.5 text-pretty text-[13.5px] font-medium leading-[1.45] text-slate-brand">
            Hubo un problema con el servidor. No perdiste nada: tu cambio sigue acá hasta que se guarde.
          </SheetDescription>
          {detalle && <p className="mt-2 text-pretty text-[12px] font-medium leading-snug text-subtle">{detalle}</p>}
        </div>
        <button
          type="button"
          onClick={onReintentar}
          disabled={reintentando}
          className="rounded-full bg-primary py-[15px] text-[14.5px] font-extrabold text-primary-foreground shadow-cta disabled:opacity-60"
        >
          {reintentando ? "Guardando…" : "Reintentar"}
        </button>
        <button type="button" onClick={onDescartar} className="rounded-full py-3 text-sm font-bold text-slate-brand">
          Descartar el cambio
        </button>
      </SheetContent>
    </Sheet>
  );
}
