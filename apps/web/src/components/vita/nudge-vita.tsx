"use client";

import { VMark } from "@/components/vita/v-mark";
import { VitaIcon } from "@/lib/vita-icons";
import { useChatOverlay } from "@/lib/chat/overlay-context";

// Nudge de Home (V7): tarjeta "¿Cómo te sentís hoy?" con el isotipo. Abre el
// chat con vita "preguntando" (no se auto-envía nada en nombre del usuario).
// El asistente sigue alcanzable también desde el FAB central.
export function NudgeVita() {
  const { abrir } = useChatOverlay();
  return (
    <button
      type="button"
      onClick={() =>
        abrir("¿En qué te ayudo hoy? Puedo agregar un medicamento o un turno, o contarte cómo viene tu día.")
      }
      className="flex w-full items-center gap-3 rounded-[20px] bg-card p-[15px] text-left shadow-card transition-transform active:scale-[0.99] motion-reduce:transition-none"
    >
      <VMark
        size={40}
        forma="circulo"
        className="shrink-0 shadow-[0_8px_20px_color-mix(in_srgb,var(--primary)_40%,transparent)] rounded-full"
      />
      <div className="min-w-0 flex-1">
        <div className="font-heading text-[14.5px] font-extrabold tracking-[-0.02em]">¿Cómo te sentís hoy?</div>
        <div className="mt-0.5 text-[11.5px] font-medium text-subtle">
          Contame, o pedime que cargue un remedio o un turno.
        </div>
      </div>
      <VitaIcon name="chevron-right" size={18} className="shrink-0 text-faint" />
    </button>
  );
}
