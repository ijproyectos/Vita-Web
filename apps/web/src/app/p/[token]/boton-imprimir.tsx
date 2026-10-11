"use client";

import { VitaIcon } from "@/lib/vita-icons";

// Se oculta al imprimir (clase `no-imprimir`, ver globals.css).
export function BotonImprimir() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-imprimir flex h-11 items-center justify-center gap-2 rounded-full bg-primary px-5 font-heading text-sm font-bold text-primary-foreground"
    >
      <VitaIcon name="doc" size={16} />
      Imprimir
    </button>
  );
}
