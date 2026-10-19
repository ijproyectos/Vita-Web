"use client";

import { VitaIcon } from "@/lib/vita-icons";
import { VMark } from "@/components/vita/v-mark";
import { useChatOverlay } from "@/lib/chat/overlay-context";

// Botón redondo con gradiente que abre el chat — usado como acción del
// TopBar en los forms ("Pedirle a vita") y como shortcut inline debajo del
// header ("Agregar por voz con vita"). A diferencia del mock, el micrófono
// no es un demo — la tool add_medication/add_appointment ya existe, así
// que pedírselo a vita en texto libre funciona de verdad.
export function VitaShortcutButton({ size = "icon" }: { size?: "icon" | "banner" }) {
  const { abrir } = useChatOverlay();

  if (size === "icon") {
    return (
      <button
        type="button"
        onClick={() => abrir()}
        aria-label="Pedirle a vita"
        className="flex size-10 items-center justify-center rounded-full shadow-[0_6px_14px_color-mix(in_srgb,var(--primary)_30%,transparent)]"
      >
        <VMark size={40} forma="circulo" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => abrir()}
      className="flex items-center gap-3 rounded-[20px] bg-card p-3.5 text-left shadow-card"
    >
      <VMark size={36} forma="circulo" className="shrink-0 rounded-full" />
      <div className="flex-1">
        <div className="font-heading text-sm font-extrabold tracking-[-0.02em]">Agregar por voz con vita</div>
        <div className="text-xs font-medium text-subtle">Contame con tus palabras y lo cargo por vos.</div>
      </div>
      <VitaIcon name="chevron-right" size={18} className="text-faint" />
    </button>
  );
}
