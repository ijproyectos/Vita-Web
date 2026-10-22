"use client";

import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";

// "Activá los avisos de vita" (V7 PERMISO DE AVISOS): explica en tres pasos
// cómo desbloquear las notificaciones cuando el navegador/celular las tiene
// bloqueadas (un sitio web no puede abrir los Ajustes del sistema, así que el
// botón principal es "Ya los activé" y vuelve a revisar el permiso).
const PASOS = ["Abrí Ajustes en tu celular", "Buscá vita en la lista de apps", "Tocá Notificaciones y activá «Permitir»"];

export function PermisoAvisosSheet({
  abierto,
  onCerrar,
  onListo,
}: {
  abierto: boolean;
  onCerrar: () => void;
  /** Se llama cuando la persona dice que ya los activó (el llamador vuelve a detectar el permiso). */
  onListo: () => void;
}) {
  return (
    <Sheet open={abierto} onOpenChange={(v) => !v && onCerrar()}>
      <SheetContent side="bottom" showCloseButton={false} className="gap-4 rounded-t-[28px] bg-card px-5 pb-[34px] pt-6">
        <div>
          <SheetTitle className="font-heading text-xl font-extrabold tracking-[-0.02em]">Activá los avisos de vita</SheetTitle>
          <SheetDescription className="mt-1.5 text-pretty text-[13.5px] font-medium leading-[1.45] text-slate-brand">
            Se cambian en los ajustes del celular. Son tres pasos.
          </SheetDescription>
        </div>
        <ol className="flex flex-col rounded-[18px] bg-canvas/60 px-3.5 py-1">
          {PASOS.map((t, i) => (
            <li key={t} className="flex items-center gap-3 border-b border-foreground/[0.06] py-[11px] last:border-b-0">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-persona-1-tint text-[13px] font-extrabold text-teal-deep">
                {i + 1}
              </span>
              <span className="text-sm font-semibold leading-snug">{t}</span>
            </li>
          ))}
        </ol>
        <button
          type="button"
          onClick={onListo}
          className="rounded-full bg-primary py-[15px] text-[14.5px] font-extrabold text-primary-foreground shadow-cta"
        >
          Ya los activé
        </button>
        <button type="button" onClick={onCerrar} className="rounded-full py-3 text-sm font-bold text-slate-brand">
          Ahora no
        </button>
      </SheetContent>
    </Sheet>
  );
}
