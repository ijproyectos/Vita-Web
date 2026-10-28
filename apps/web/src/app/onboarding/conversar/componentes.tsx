"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { VitaAvatar } from "@/components/vita/v-mark";
import { VitaIcon } from "@/lib/vita-icons";
import { cn } from "@/lib/utils";
import { CLASES_COLOR } from "@/lib/familia/colores";
import type { ColorPerfil } from "@/lib/familia/tipos";
import { MINUTOS_VIGENCIA_CODIGO_ACCESO } from "@/lib/acceso-codigo/tipos";
import { useGrabacionVoz } from "@/lib/voz/usar-grabacion-voz";

// Piezas de UI compartidas por el onboarding conversacional nuevo
// (/onboarding/conversar) — bocadillos de chat, chips, indicador de
// "escribiendo" y el campo de entrada texto+voz. La fuente de verdad visual
// es el diseño V7 (`pantallas/V7/design v0 vita/Onboarding.dc.html`).

export type Mensaje = {
  id: string;
  from: "vita" | "user";
  texto: string;
  // Duración aproximada en segundos, solo si el mensaje vino por dictado —
  // ver CampoEntrada. Se calcula client-side (Date.now() al iniciar menos
  // Date.now() al recibir la transcripción), no viene de ningún metadato
  // real del archivo de audio (que ya se descarta apenas se transcribe).
  audioSeg?: number;
  // Tarjeta congelada: un widget (consentimiento, remedio, código, resumen) que
  // quedó en el historial como solo lectura, mostrando lo que se eligió. Si está,
  // se dibuja la tarjeta en vez de la burbuja (`texto` va vacío).
  tarjeta?: ReactNode;
};

const ANIM_ENTRADA = "animate-in fade-in slide-in-from-bottom-1.5 duration-300";

// Avatar de vita junto a la burbuja (V7: 38px sobre círculo claro). Solo se
// dibuja en la última burbuja consecutiva de vita; en las demás queda el hueco.
function AvatarBurbuja({ visible }: { visible: boolean }) {
  if (!visible) return <div className="size-[38px] shrink-0" aria-hidden="true" />;
  return (
    <div className="flex size-[38px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-avatar-fondo ring-1 ring-ink/5">
      <VitaAvatar size={34} />
    </div>
  );
}

export function Burbuja({ m, conAvatar = true }: { m: Mensaje; conAvatar?: boolean }) {
  if (m.from === "user") {
    return (
      <div className={cn("flex justify-end", ANIM_ENTRADA)}>
        <div className="max-w-[78%] whitespace-pre-line rounded-[20px_20px_6px_20px] bg-primary px-[15px] py-[11px] text-[14.5px] font-medium leading-[1.45] text-primary-foreground shadow-bubble">
          {typeof m.audioSeg === "number" && (
            <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-primary-foreground/75">
              Audio · 0:{String(Math.min(59, m.audioSeg)).padStart(2, "0")}
            </div>
          )}
          {m.texto}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex items-end gap-2", ANIM_ENTRADA)}>
      <AvatarBurbuja visible={conAvatar} />
      <div className="max-w-[78%] whitespace-pre-line rounded-[20px_20px_20px_6px] bg-card px-4 py-3 text-[14.5px] font-medium leading-[1.5] shadow-card">
        {m.texto}
      </div>
    </div>
  );
}

export function PuntosEscribiendo() {
  return (
    <div className="flex items-end gap-2">
      <AvatarBurbuja visible />
      <div className="flex gap-[5px] rounded-[20px_20px_20px_6px] bg-card px-[17px] py-3.5 shadow-card">
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
      className="rounded-full border border-teal-line bg-card px-[15px] py-2.5 text-[13.5px] font-bold text-teal-deep transition-colors disabled:opacity-50"
    >
      {texto}
    </button>
  );
}

/**
 * Chips de selección múltiple (condiciones, alergias): las opciones normales
 * se tildan, las "solas" (Ninguna / Saltear) responden de una, y "Listo"
 * aparece cuando hay algo tildado. Mismo comportamiento que `MULTI` del diseño.
 */
export function ChipsMulti({
  opciones,
  solas,
  seleccion,
  onToggle,
  onSola,
  onListo,
}: {
  opciones: readonly string[];
  solas: readonly string[];
  seleccion: string[];
  onToggle: (opcion: string) => void;
  onSola: (opcion: string) => void;
  onListo: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-[7px] pl-[46px]">
      {opciones.map((o) => {
        const sel = seleccion.includes(o);
        return (
          <button
            key={o}
            type="button"
            aria-pressed={sel}
            onClick={() => onToggle(o)}
            className={cn(
              "rounded-full border px-[15px] py-2.5 text-[13.5px] font-bold transition-colors",
              sel ? "border-primary bg-primary text-primary-foreground" : "border-teal-line bg-card text-teal-deep"
            )}
          >
            {sel ? "✓ " : ""}
            {o}
          </button>
        );
      })}
      {solas.map((o) => (
        <ChipBoton key={o} texto={o} onClick={() => onSola(o)} />
      ))}
      {seleccion.length > 0 && (
        <button type="button" onClick={onListo} className="rounded-full border border-ink bg-ink px-[15px] py-2.5 text-[13.5px] font-bold text-background">
          Listo →
        </button>
      )}
    </div>
  );
}

type EstadoTab = "activo" | "inactivo" | "completo";

// "Vos" siempre es teal (el color de marca); la persona cuidada usa el color
// que se le asignó al crear su perfil (perfiles.color, tokens --persona-*).
type ColorTab = ColorPerfil;

export function EncabezadoConversar({
  tabs,
  linkFormulario,
  escribiendo,
  onTerminar,
}: {
  tabs: { label: string; estado: EstadoTab; color: ColorTab }[];
  linkFormulario: string;
  escribiendo: boolean;
  // "Terminar después" (V7 `showSkip`): solo se pasa cuando ya hay algo guardado.
  onTerminar?: () => void;
}) {
  return (
    <header className="shrink-0 bg-card px-[18px] pb-3.5 pt-14 shadow-header">
      <div className="flex items-center gap-3">
        <div className="flex size-[52px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-avatar-fondo ring-1 ring-ink/5">
          <VitaAvatar size={46} estado={escribiendo ? "thinking" : "idle"} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-heading text-[21px] font-extrabold leading-none tracking-[-0.05em]">
            vi<span className="text-primary">ta</span>
          </div>
          <div className="mt-[5px] text-xs font-semibold text-subtle">{escribiendo ? "Escribiendo…" : "Armando tu perfil"}</div>
        </div>
        {onTerminar && (
          <button
            type="button"
            onClick={onTerminar}
            className="rounded-full bg-canvas px-3.5 py-[9px] text-[13px] font-bold text-slate-brand"
          >
            Terminar después
          </button>
        )}
      </div>

      {tabs.length > 1 && (
        <div className="mt-3 flex gap-2">
          {tabs.map((t) => (
            <span
              key={t.label}
              className={cn(
                "flex-1 rounded-full px-3 py-2 text-center text-[12.5px] font-bold transition-colors",
                t.estado === "activo" && cn(CLASES_COLOR[t.color].solido, "text-primary-foreground"),
                t.estado === "completo" && cn(CLASES_COLOR[t.color].fondo, CLASES_COLOR[t.color].tinta),
                t.estado === "inactivo" && "bg-canvas text-subtle"
              )}
            >
              {t.label}
            </span>
          ))}
        </div>
      )}

      <Link href={linkFormulario} className="mt-2.5 block text-right text-[12.5px] font-semibold text-teal-deep underline">
        Prefiero un formulario
      </Link>
    </header>
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
  activo = true,
  placeholder = "Escribí o dictá…",
}: {
  onEnviar: (texto: string, audioSeg?: number) => void;
  disabled?: boolean;
  // false = barra inerte "Elegí una opción" (V7: el paso actual se responde con chips).
  activo?: boolean;
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
  const habilitado = activo && !disabled;
  const puedeEnviar = habilitado && texto.trim() !== "";

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-full bg-canvas py-[5px] pl-[18px] pr-[5px] transition-shadow",
        habilitado && "shadow-[0_0_0_2px_var(--primary)]"
      )}
    >
      <input
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && enviarTexto()}
        disabled={!habilitado || grabando}
        aria-label={activo ? placeholder : "Elegí una opción"}
        placeholder={
          !activo ? "Elegí una opción" : grabando ? (estado === "procesando" ? "Transcribiendo…" : "Escuchando…") : placeholder
        }
        className="min-w-0 flex-1 bg-transparent py-2.5 text-[15px] font-medium outline-none placeholder:text-subtle disabled:opacity-100"
      />
      {habilitado && !texto.trim() && (
        <button
          type="button"
          onClick={alternarMic}
          aria-label={grabando ? "Detener dictado" : "Dictar por voz"}
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-full",
            grabando ? "bg-chip-teal-bg text-primary" : "text-subtle"
          )}
        >
          <VitaIcon name="mic" size={18} />
        </button>
      )}
      <button
        type="button"
        onClick={enviarTexto}
        disabled={!puedeEnviar}
        aria-label="Enviar"
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-full text-primary-foreground transition-colors",
          puedeEnviar ? "bg-primary" : "bg-deshabilitado"
        )}
      >
        <VitaIcon name="send" size={18} />
      </button>
    </div>
  );
}

/**
 * Tarjeta del código de acceso en la charla (f_share): los seis dígitos, copiar
 * y compartir (hoja nativa del celular; si no hay, WhatsApp web). El código es
 * real (un solo uso) y se muestra solo acá: en la DB queda el hash.
 */
export function TarjetaCodigoCompartir({ nombre, codigo, venceA }: { nombre: string; codigo: string; venceA: string }) {
  const [copiado, setCopiado] = useState(false);

  function mensaje() {
    return `Tu código para entrar a vita: ${codigo}. Abrí ${window.location.origin}/login, tocá «Tengo un código» y escribilo. Vence en ${MINUTOS_VIGENCIA_CODIGO_ACCESO} minutos y sirve una sola vez.`;
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(codigo);
      setCopiado(true);
      toast.success("Código copiado");
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      toast.error("No pudimos copiar el código.");
    }
  }

  async function compartir() {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ text: mensaje() });
      } catch {
        /* la persona cerró la hoja de compartir: no es un error */
      }
      return;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(mensaje())}`, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="flex flex-col items-center rounded-[20px] bg-card px-4 pb-4 pt-[18px] text-center shadow-card">
      <div className="eyebrow text-subtle">Código para {nombre}</div>
      <div className="mt-3.5 grid w-full grid-cols-6 gap-1.5" role="img" aria-label={`Código ${codigo.split("").join(" ")}`}>
        {codigo.split("").map((c, i) => (
          <div key={i} aria-hidden className="flex h-[52px] items-center justify-center rounded-[14px] bg-secondary font-heading text-[26px] font-extrabold text-teal-deep">
            {c}
          </div>
        ))}
      </div>
      <div className="mt-4 flex w-full gap-2">
        <button type="button" onClick={compartir} className="flex-1 rounded-full bg-primary py-[12px] font-heading text-[13.5px] font-extrabold text-primary-foreground shadow-cta">
          Compartir
        </button>
        <button
          type="button"
          onClick={copiar}
          className="rounded-full bg-card px-5 py-[12px] font-heading text-[13.5px] font-extrabold text-teal-deep shadow-[inset_0_0_0_1.5px_var(--chip-teal-bg)]"
        >
          {copiado ? "Copiado" : "Copiar"}
        </button>
      </div>
      <p className="mt-3 text-pretty text-[11.5px] font-medium text-subtle">
        Vence a las {venceA} ({MINUTOS_VIGENCIA_CODIGO_ACCESO} minutos desde que se generó) y sirve una sola vez. Si se vence, le mandás otro desde Familia.
      </p>
    </div>
  );
}
