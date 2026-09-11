"use client";

import { VitaIcon } from "@/lib/vita-icons";
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
        className="flex size-10 items-center justify-center rounded-full bg-gradient-to-br from-[#22d3ee] to-[#0e7490] text-white shadow-[0_6px_14px_rgba(8,145,178,0.3)]"
      >
        <VitaIcon name="sparkle" size={16} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => abrir()}
      className="flex items-center gap-3 rounded-[20px] p-3.5 text-left shadow-[inset_0_0_0_1px_rgba(8,145,178,0.15)]"
      style={{ background: "linear-gradient(135deg, rgba(8,145,178,0.08), rgba(14,116,144,0.04))" }}
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#22d3ee] to-[#0e7490] text-white">
        <VitaIcon name="sparkle" size={16} />
      </div>
      <div className="flex-1">
        <div className="font-heading text-[14px] font-bold">Agregar por voz con vita</div>
        <div className="text-xs text-muted-foreground">Contame con tus palabras y lo cargo por vos.</div>
      </div>
      <VitaIcon name="chevron-right" size={18} className="text-primary" />
    </button>
  );
}
