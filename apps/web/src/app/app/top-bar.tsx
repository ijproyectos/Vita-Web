"use client";

import { useRouter } from "next/navigation";
import { VitaIcon } from "@/lib/vita-icons";
import type { ReactNode } from "react";

// Header con back button para pantallas de formulario/detalle — porta el
// `showTopBar`/`ms-backbtn` del diseño. router.back() en vez de
// hardcodear un origen fijo (más robusto que el mock, que solo contempla
// una única pantalla de entrada).
export function TopBar({
  eyebrow,
  title,
  accionDerecha,
}: {
  eyebrow?: string;
  title: string;
  accionDerecha?: ReactNode;
}) {
  const router = useRouter();
  return (
    <div className="mt-1.5 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Volver"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-card shadow-[var(--shadow-card,0_8px_24px_rgba(15,33,54,0.06))]"
        >
          <VitaIcon name="chevron-left" size={18} />
        </button>
        <div>
          {eyebrow && <div className="text-[12px] font-semibold uppercase tracking-wide text-primary">{eyebrow}</div>}
          <div className="mt-0.5 font-heading text-[22px] font-extrabold tracking-tight">{title}</div>
        </div>
      </div>
      {accionDerecha}
    </div>
  );
}
