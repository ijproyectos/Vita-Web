"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { ANIMACION_POR_ESTADO, assetPorEstado, type EstadoAvatar } from "./estados-avatar";
import { useCuadroHabla } from "./usar-cuadro-habla";

// Marca "v" geométrica de vita.ia — se mantiene tal cual para los lugares
// que todavía necesitan el ícono chico plano (favicon-like), no el
// personaje. VitaAvatar es la que cambió: portaba el círculo con esta V,
// ahora renderiza el personaje del character sheet
// (asistente/Vita character sheet concepts/), reaccionando al estado de la
// conversación.
export function VMark({ size = 30, color = "#fff" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <path
        d="M6 8.5 L13.5 23.5 A2 2 0 0 0 17.5 23.5 L26 8.5"
        stroke={color}
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="14" r="1.5" fill={color} opacity="0.9" />
    </svg>
  );
}

/**
 * El personaje de vita — 8 estados (EstadoAvatar, estados-avatar.ts),
 * ninguno exagerado: un solo frame estático + una animación CSS sutil
 * (respirar/mecerse) por estado, más lip-sync básico real (3 frames de
 * boca, elegidos por la amplitud del audio, no al azar) mientras
 * `estado === "speaking"`. Crossfade simple entre estados (nunca un corte
 * duro) y `prefers-reduced-motion` apaga toda animación de movimiento —
 * el estado se sigue viendo (cambia la expresión), solo no respira/mece.
 *
 * Reemplaza el círculo con la V que tenía antes — mismo nombre/prop
 * `size`, así que los 8 call sites existentes (chat, modo simple,
 * onboarding, burbujas de mensaje) no necesitan tocarse salvo los que
 * quieran empezar a pasar `estado` de verdad.
 */
export function VitaAvatar({ size = 36, estado = "idle" }: { size?: number; estado?: EstadoAvatar }) {
  const hablando = estado === "speaking";
  const cuadroHabla = useCuadroHabla(hablando);
  // Valor inicial correcto ya en el useState (convención del repo para
  // react-hooks/set-state-in-effect cuando el estado sí es visible en el
  // render) — el efecto solo se suscribe a cambios futuros, nunca llama
  // setState directamente en su cuerpo. matchMedia no existe en SSR, de ahí
  // el guard — un único frame de diferencia en una animación sutil no
  // amerita retrasar el valor real a costa de complejidad extra.
  const [prefiereMenosMovimiento, setPrefiereMenosMovimiento] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const escuchar = (e: MediaQueryListEvent) => setPrefiereMenosMovimiento(e.matches);
    mq.addEventListener("change", escuchar);
    return () => mq.removeEventListener("change", escuchar);
  }, []);

  const src = assetPorEstado(estado, cuadroHabla);

  return (
    <div
      style={{ width: size, height: size, flexShrink: 0, position: "relative" }}
      role="img"
      aria-label={ETIQUETA_ESTADO[estado]}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          animation: prefiereMenosMovimiento ? "none" : ANIMACION_POR_ESTADO[estado],
        }}
      >
        <Image
          src={src}
          alt=""
          width={480}
          height={600}
          unoptimized
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
          // El cambio de estado reemplaza el <img> (key nueva) — la
          // transición de opacidad la da la propia carga de la imagen
          // (decode async) más el fade CSS del contenedor padre si el
          // caller lo envuelve; acá alcanza con no cortar duro el layout.
          key={src}
          priority
        />
      </div>
    </div>
  );
}

const ETIQUETA_ESTADO: Record<EstadoAvatar, string> = {
  idle: "vita, en espera",
  calm: "vita, tranquila",
  listening: "vita, escuchando",
  thinking: "vita, pensando",
  speaking: "vita, hablando",
  happy: "vita, contenta",
  empathetic: "vita, acompañándote",
  alert: "vita, con un aviso importante",
};

export function VitaWordmark({ size = 26 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2">
      <VitaAvatar size={size} />
      <span
        className="font-heading font-extrabold tracking-tight"
        style={{ fontSize: size * 0.68, color: "var(--foreground)" }}
      >
        vita<span style={{ color: "var(--primary)" }}>.ia</span>
      </span>
    </div>
  );
}
