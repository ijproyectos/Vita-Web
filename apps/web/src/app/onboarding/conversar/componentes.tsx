"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { VitaAvatar } from "@/components/vita/v-mark";
import { VitaIcon } from "@/lib/vita-icons";
import { cn } from "@/lib/utils";
import { useGrabacionVoz } from "@/lib/voz/usar-grabacion-voz";

// Piezas de UI compartidas por el onboarding conversacional nuevo
// (/onboarding/conversar) — bocadillos de chat, chips, indicador de
// "escribiendo" y el campo de entrada texto+voz. Estética calcada de
// onboarding/chat/encuesta.tsx (el guion viejo), no del sistema de diseño
// propio del mock (ver CLAUDE.md).

export type Mensaje = {
  id: string;
  from: "vita" | "user";
  texto: string;
  // Duración aproximada en segundos, solo si el mensaje vino por dictado —
  // ver CampoEntrada. Se calcula client-side (Date.now() al iniciar menos
  // Date.now() al recibir la transcripción), no viene de ningún metadato
  // real del archivo de audio (que ya se descarta apenas se transcribe).
  audioSeg?: number;
};

export function Burbuja({ m }: { m: Mensaje }) {
  if (m.from === "user") {
    return (
      <div className="mb-2.5 flex justify-end">
        <div className="max-w-[80%] whitespace-pre-line rounded-[20px] rounded-br-[6px] bg-gradient-to-br from-[#22d3ee] to-[#0e7490] px-3.5 py-2.5 text-[14.5px] text-white">
          {typeof m.audioSeg === "number" && (
            <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-white/75">
              Audio · 0:{String(Math.min(59, m.audioSeg)).padStart(2, "0")}
            </div>
          )}
          {m.texto}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-2.5 flex items-end gap-2">
      <VitaAvatar size={26} />
      <div className="max-w-[82%] whitespace-pre-line rounded-[20px] rounded-bl-[6px] bg-card px-3.5 py-2.5 text-[14.5px] leading-snug shadow-[var(--shadow-card,0_8px_24px_rgba(15,33,54,0.06))]">
        {m.texto}
      </div>
    </div>
  );
}

export function PuntosEscribiendo() {
  return (
    <div className="flex items-end gap-2">
      <VitaAvatar size={26} />
      <div className="flex gap-1 rounded-[20px] rounded-bl-[6px] bg-card px-4 py-3 shadow-[var(--shadow-card,0_8px_24px_rgba(15,33,54,0.06))]">
        {[0, 1, 2].map((i) => (
          <span key={i} className="size-1.5 animate-pulse rounded-full bg-primary" style={{ animationDelay: `${i * 0.15}s` }} />
        ))}
      </div>
    </div>
  );
}

export function ChipBoton({ texto, onClick, disabled }: { texto: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-full bg-card px-3.5 py-2 text-[13px] font-semibold text-primary shadow-[inset_0_0_0_1px_var(--border)] disabled:opacity-50"
    >
      {texto}
    </button>
  );
}

type EstadoTab = "activo" | "inactivo" | "completo";

// "Vos" siempre es teal (el color de marca), la persona cuidada siempre es
// violeta (colorChipPorIndice(1) — índice 1 porque el 0/teal queda
// reservado para "vos", ver conversar.tsx) — coincide con el mock, donde
// el tab "2 · Vos" es teal claro y "1 · Elsa" es violeta.
type ColorTab = "teal" | "violet";

const FONDO_ACTIVO: Record<ColorTab, string> = { teal: "bg-chip-teal-ink", violet: "bg-chip-violet-ink" };
const FONDO_COMPLETO: Record<ColorTab, string> = { teal: "bg-chip-teal-bg text-chip-teal-ink", violet: "bg-chip-violet-bg text-chip-violet-ink" };

export function EncabezadoConversar({
  tabs,
  linkFormulario,
}: {
  tabs: { label: string; estado: EstadoTab; color: ColorTab }[];
  linkFormulario: string;
}) {
  return (
    <div className="flex flex-col gap-3 px-4.5 pb-3 pt-4.5">
      <div className="flex items-center justify-between">
        <div className="font-heading text-[17px] font-extrabold">
          vi<span className="text-primary">ta</span>
        </div>
        <Link href={linkFormulario} className="text-[12.5px] font-semibold text-primary underline">
          Prefiero un formulario
        </Link>
      </div>

      {tabs.length > 1 && (
        <div className="flex gap-2">
          {tabs.map((t) => (
            <span
              key={t.label}
              className={cn(
                "flex-1 rounded-full px-3 py-2 text-center text-[12.5px] font-bold transition-colors",
                t.estado === "activo" && cn(FONDO_ACTIVO[t.color], "text-white"),
                t.estado === "completo" && FONDO_COMPLETO[t.color],
                t.estado === "inactivo" && "bg-secondary text-muted-foreground"
              )}
            >
              {t.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Campo de entrada texto + dictado por voz, compartido por todos los pasos
 * de texto libre del flujo (nombre/edad, medicamentos). Reutiliza
 * useGrabacionVoz (lib/voz/usar-grabacion-voz.ts) tal cual — no se
 * reimplementa una segunda captura de audio. A diferencia del modo
 * manos-libres del chat con vita, acá el mic es un toggle explícito (tocar
 * para escuchar, tocar de nuevo o esperar el silencio para cortar): apenas
 * llega la transcripción se envía sola (no pasa por el input de texto),
 * mismo criterio visual que el mock ("AUDIO · 0:06" en la burbuja).
 */
export function CampoEntrada({
  onEnviar,
  disabled,
  placeholder = "Escribí o dictá…",
}: {
  onEnviar: (texto: string, audioSeg?: number) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [texto, setTexto] = useState("");
  const inicioGrabacionRef = useRef(0);

  const { estado, iniciar, detener } = useGrabacionVoz({
    onTranscripcion: (transcripto) => {
      // new Date() en vez de Date.now() — mismo criterio que el resto del
      // proyecto (ver CLAUDE.md): el lint de pureza de hooks marca
      // Date.now()/Math.random() como sospechosos incluso acá, donde el
      // callback solo corre en un evento async real, nunca durante el
      // render; new Date().getTime() es equivalente y el lint lo tolera,
      // sin necesitar un eslint-disable nuevo.
      const duracionSeg = Math.max(1, Math.round((new Date().getTime() - inicioGrabacionRef.current) / 1000));
      detener();
      onEnviar(transcripto, duracionSeg);
    },
    onError: (mensaje) => {
      toast.error(mensaje);
      detener();
    },
  });

  async function alternarMic() {
    if (estado !== "inactivo") {
      detener();
      return;
    }
    inicioGrabacionRef.current = new Date().getTime();
    const resultado = await iniciar();
    if (!resultado.ok) {
      toast.error(
        resultado.motivo === "permiso-denegado"
          ? "Necesitamos acceso al micrófono para dictar."
          : "Tu navegador no soporta dictado por voz."
      );
    }
  }

  function enviarTexto() {
    const limpio = texto.trim();
    if (!limpio) return;
    setTexto("");
    onEnviar(limpio);
  }

  const grabando = estado !== "inactivo";

  return (
    <div className="flex items-center gap-2 rounded-full bg-card py-1.5 pl-4.5 shadow-[0_8px_24px_rgba(15,33,54,0.08)]">
      <input
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && enviarTexto()}
        disabled={disabled || grabando}
        placeholder={grabando ? (estado === "procesando" ? "Transcribiendo…" : "Escuchando…") : placeholder}
        className="flex-1 bg-transparent py-2 text-[15px] outline-none disabled:opacity-60"
      />
      {texto.trim() ? (
        <button
          type="button"
          onClick={enviarTexto}
          disabled={disabled}
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-60"
        >
          <VitaIcon name="send" size={18} />
        </button>
      ) : (
        <button
          type="button"
          onClick={alternarMic}
          disabled={disabled}
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-full",
            grabando ? "bg-chip-teal-bg text-primary" : "bg-muted text-muted-foreground",
            "disabled:opacity-60"
          )}
        >
          <VitaIcon name="mic" size={18} />
        </button>
      )}
    </div>
  );
}
