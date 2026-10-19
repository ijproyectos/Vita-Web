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
