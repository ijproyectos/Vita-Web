"use client";

import { VitaIcon } from "@/lib/vita-icons";
import { useChatOverlay } from "@/lib/chat/overlay-context";

// "Pedile a vita que lo actualice" (V7 Resumen de salud): abre el chat con vita
// listo para que cuentes qué cambió (las tools de perfil ya existen). Solo se
// ofrece sobre el propio perfil: el chat actúa sobre la cuenta logueada.
export function BotonPedirAVita() {
  const { abrir } = useChatOverlay();
  return (
    <button
      type="button"
      onClick={() => abrir("Contame qué cambió de tu perfil de salud y lo actualizo.")}
      className="flex items-center gap-3 rounded-full bg-ink px-[18px] py-[15px] text-left text-background transition-transform active:scale-[0.98] motion-reduce:transition-none"
    >
      <span className="flex-1 text-[13.5px] font-bold tracking-[-0.01em]">
        Pedile a vi<span className="text-primary">ta</span> que lo actualice
      </span>
      <VitaIcon name="chevron-right" size={17} strokeWidth={2.2} />
    </button>
  );
}
