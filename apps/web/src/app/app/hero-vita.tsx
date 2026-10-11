"use client";

import { VitaAvatar } from "@/components/vita/v-mark";
import { VitaIcon } from "@/lib/vita-icons";
import { useChatOverlay } from "@/lib/chat/overlay-context";

// Hero de Home: vita es una de las partes más usadas de la app, así que el
// acceso al asistente va arriba y grande (avatar 3D de 120px), no como un
// nudge discreto al final. "Hablar con vita" abre el chat con vita
// "preguntando" cómo te sentís (no se auto-envía nada en nombre del usuario).
export function HeroVita() {
  const { abrir } = useChatOverlay();
  return (
    <section className="flex items-center gap-2 overflow-hidden rounded-[24px] bg-secondary py-3 pl-2 pr-4 shadow-card">
      <VitaAvatar size={120} />
      <div className="flex min-w-0 flex-1 flex-col items-start gap-2.5">
        <div>
          <div className="font-heading text-[17px] font-extrabold leading-tight">Hola, soy vita</div>
          <div className="mt-0.5 text-[12.5px] leading-snug text-muted-foreground">
            Contame cómo estás o pedime que agregue un medicamento o un turno.
          </div>
        </div>
        <button
          type="button"
          onClick={() => abrir("¿En qué te ayudo hoy? Puedo agregar un medicamento o un turno, o contarte cómo viene tu día.")}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-[14px] font-bold text-primary-foreground transition-transform active:scale-95"
        >
          Hablar con vita
          <VitaIcon name="chevron-right" size={16} />
        </button>
      </div>
    </section>
  );
}
