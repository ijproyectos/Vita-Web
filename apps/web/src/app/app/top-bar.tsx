"use client";

import { useVolver } from "@/lib/navegacion/rastreador";
import { VitaIcon } from "@/lib/vita-icons";
import type { ReactNode } from "react";

// Header con back button para pantallas de formulario/detalle — porta el
// `showTopBar`/`ms-backbtn` del diseño. router.back() cuando hay
// historial dentro de la app; si no (entrada directa), va a `volverA`.
export function TopBar({
  eyebrow,
  title,
  accionDerecha,
  volverA = "/app",
}: {
  eyebrow?: string;
  title: string;
  accionDerecha?: ReactNode;
  /** Pantalla padre lógica: destino de "Volver" cuando no hay historial dentro de la app. */
  volverA?: string;
}) {
  const volver = useVolver(volverA);
  return (
    <div className="mt-1.5 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={volver}
          aria-label="Volver"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-card shadow-card transition-transform active:scale-[0.94] motion-reduce:transition-none"
        >
          <VitaIcon name="chevron-left" size={18} strokeWidth={2.2} />
        </button>
        <div>
          {eyebrow && <div className="eyebrow text-primary">{eyebrow}</div>}
          <h1 className="mt-0.5 font-heading text-[22px] font-extrabold tracking-[-0.02em]">{title}</h1>
        </div>
      </div>
      {accionDerecha}
    </div>
  );
}
