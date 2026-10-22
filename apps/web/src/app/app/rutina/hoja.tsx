"use client";

import type { ReactNode } from "react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { VitaIcon } from "@/lib/vita-icons";
import { cn } from "@/lib/utils";

// Cáscara común de las hojas de detalle de la Rutina (medicamento y turno,
// V7 "DETALLE MEDICAMENTO"/"DETALLE TURNO"): fondo canvas, grabber, cabecera
// con tile + eyebrow + nombre + cerrar, y piezas de contenido compartidas.
export function Hoja({
  abierto,
  onCerrar,
  icono,
  tileClassName,
  eyebrow,
  eyebrowClassName,
  titulo,
  subtitulo,
  children,
}: {
  abierto: boolean;
  onCerrar: () => void;
  icono: ReactNode;
  tileClassName: string;
  eyebrow: string;
  eyebrowClassName: string;
  titulo: string;
  subtitulo?: string;
  children: ReactNode;
}) {
  return (
    <Sheet open={abierto} onOpenChange={(v) => !v && onCerrar()}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="max-h-[86%] gap-4 overflow-y-auto rounded-t-[28px] bg-canvas px-4 pb-[34px] pt-3.5 [scrollbar-width:none]"
      >
        <div aria-hidden className="mx-auto h-1 w-10 shrink-0 rounded bg-line" />
        <div className="flex items-center gap-3.5 px-1">
          <div className={cn("flex size-14 shrink-0 items-center justify-center rounded-[18px]", tileClassName)}>{icono}</div>
          <div className="min-w-0 flex-1">
            <div className={cn("eyebrow", eyebrowClassName)}>{eyebrow}</div>
            <SheetTitle className="mt-[3px] font-heading text-2xl font-extrabold leading-tight tracking-[-0.04em]">{titulo}</SheetTitle>
            {subtitulo && <div className="mt-0.5 text-[12.5px] font-semibold text-slate-brand">{subtitulo}</div>}
            <SheetDescription className="sr-only">Detalle</SheetDescription>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="flex size-[38px] shrink-0 items-center justify-center self-start rounded-full bg-card shadow-card transition-transform active:scale-[0.94] motion-reduce:transition-none"
          >
            <VitaIcon name="close" size={16} strokeWidth={2.4} className="text-slate-brand" />
          </button>
        </div>
        {children}
      </SheetContent>
    </Sheet>
  );
}

export function Dato({
  label,
  valor,
  sub,
  valorClassName,
}: {
  label: string;
  valor: string;
  sub?: string;
  valorClassName?: string;
}) {
  return (
    <div className="min-w-0 rounded-[16px] bg-card px-3.5 py-[13px] shadow-item">
      <div className="eyebrow text-subtle">{label}</div>
      <div className={cn("mt-1 font-heading text-base font-extrabold tracking-[-0.02em] tabular-nums", valorClassName)}>{valor}</div>
      {sub && <div className="mt-px text-[11.5px] font-medium text-subtle">{sub}</div>}
    </div>
  );
}

export function SeccionHoja({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div>
      <div className="eyebrow px-0.5 pb-2.5 text-subtle">{titulo}</div>
      {children}
    </div>
  );
}

/** Botón secundario blanco ("Editar"). */
export const CLASE_BOTON_SECUNDARIO =
  "rounded-full bg-card px-5 py-3.5 text-sm font-bold text-slate-brand shadow-item transition-transform active:scale-[0.98] motion-reduce:transition-none";
