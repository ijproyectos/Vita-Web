"use client";

import { VitaIcon } from "@/lib/vita-icons";
import { cn } from "@/lib/utils";

// Piezas compartidas por las listas con edición en la propia fila de V7
// ("Mis medicamentos", "Mis turnos", "Condiciones y alergias"): lápiz y
// papelera circulares, el cuadro de confirmación de borrado, los campos
// pill con etiqueta y la pareja Guardar / Cancelar.

export function BotonLapiz({ onClick, etiqueta }: { onClick: () => void; etiqueta: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={etiqueta}
      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-canvas/60 text-slate-brand transition-colors hover:bg-canvas"
    >
      <VitaIcon name="edit" size={14} strokeWidth={2.2} />
    </button>
  );
}

export function BotonPapelera({ onClick, etiqueta }: { onClick: () => void; etiqueta: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={etiqueta}
      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-canvas/60 text-destructive transition-colors hover:bg-destructive/10"
    >
      <VitaIcon name="trash" size={14} strokeWidth={2.2} />
    </button>
  );
}

export function ConfirmarEliminar({
  titulo,
  detalle,
  pendiente,
  onConfirmar,
  onCancelar,
}: {
  titulo: string;
  detalle: string;
  pendiente?: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 bg-destructive/[0.04] p-4">
      <div>
        <div className="font-heading text-[14.5px] font-extrabold tracking-[-0.02em]">{titulo}</div>
        <div className="mt-0.5 text-[11.5px] font-medium text-subtle">{detalle}</div>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onConfirmar}
          disabled={pendiente}
          className="flex-1 rounded-full bg-destructive py-[11px] text-[13.5px] font-extrabold text-primary-foreground disabled:opacity-60"
        >
          {pendiente ? "Eliminando…" : "Eliminar"}
        </button>
        <button
          type="button"
          onClick={onCancelar}
          disabled={pendiente}
          className="rounded-full bg-secondary px-[18px] py-[11px] text-[13.5px] font-bold text-slate-brand"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

export function BotonesGuardar({
  pendiente,
  deshabilitado,
  onCancelar,
}: {
  pendiente?: boolean;
  deshabilitado?: boolean;
  onCancelar: () => void;
}) {
  return (
    <div className="flex gap-2">
      <button
        type="submit"
        disabled={pendiente || deshabilitado}
        className="flex-1 rounded-full bg-primary py-[11px] text-[13.5px] font-extrabold text-primary-foreground disabled:opacity-60"
      >
        {pendiente ? "Guardando…" : "Guardar"}
      </button>
      <button
        type="button"
        onClick={onCancelar}
        className="rounded-full bg-secondary px-[18px] py-[11px] text-[13.5px] font-bold text-slate-brand"
      >
        Cancelar
      </button>
    </div>
  );
}

export const CLASE_INPUT_PILL =
  "w-full rounded-full border border-foreground/10 bg-canvas/60 px-4 py-[11px] text-sm font-semibold outline-none placeholder:font-medium placeholder:text-faint focus-visible:ring-2 focus-visible:ring-primary/40";

export function CampoPill({
  etiqueta,
  className,
  children,
}: {
  etiqueta: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <span className="eyebrow pl-1 text-subtle">{etiqueta}</span>
      {children}
    </label>
  );
}
