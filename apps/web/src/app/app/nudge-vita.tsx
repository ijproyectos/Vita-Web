"use client";

import { VitaAvatar } from "@/components/vita/v-mark";
import { VitaIcon } from "@/lib/vita-icons";
import { useChatOverlay } from "@/lib/chat/overlay-context";

// "¿Cómo te sentís hoy?" — gancho conversacional sutil de Home, porta el
// bloque final de HomeScreen.jsx. Abre el chat con vita "preguntando" esto
// (no se auto-envía nada en nombre del usuario).
export function NudgeVita() {
  const { abrir } = useChatOverlay();
  return (
    <button
      type="button"
      onClick={() => abrir("¿Cómo te sentís hoy? Contame y lo registro en tu historial.")}
      className="flex items-center gap-3 rounded-[20px] bg-secondary p-3.5 text-left"
    >
      <VitaAvatar size={36} />
      <div className="flex-1">
        <div className="font-heading text-[14px] font-bold">¿Cómo te sentís hoy?</div>
        <div className="text-xs text-muted-foreground">Contame y lo registro en tu historial.</div>
      </div>
      <VitaIcon name="chevron-right" size={18} className="text-muted-foreground" />
    </button>
  );
}
