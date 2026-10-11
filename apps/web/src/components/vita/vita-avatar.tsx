"use client";

import { useEffect, useRef, useState } from "react";
import type { EstadoAvatar } from "./estados-avatar";
import { intencionDe } from "./vita-3d/mapeo-estado";
import type { Instancia } from "./vita-3d/motor";

/**
 * El personaje de vita — modelo 3D en tiempo real (three.js, fuente de
 * diseño: design_handoff_vita_avatar/). `three` y el motor se cargan con
 * import() dinámico (nunca bloquean el primer paint); mientras tanto — o si
 * WebGL no está disponible — se muestra un cuadrado teal redondeado con ojos
 * CSS. Todas las instancias comparten UN WebGLRenderer (ver vita-3d/motor.ts).
 *
 * `interactivo` (default: size >= 56) activa mirada al puntero, hover, toque
 * (aplaste+saludo) y saltito de entrada; los avatares chicos inline se
 * renderizan a baja frecuencia y sin interacción.
 * `activo=false` pausa el render (ej. overlay del chat cerrado pero montado).
 */
export function VitaAvatar({
  size = 36,
  estado = "idle",
  interactivo,
  activo = true,
}: {
  size?: number;
  estado?: EstadoAvatar;
  interactivo?: boolean;
  activo?: boolean;
}) {
  const esInteractivo = interactivo ?? size >= 56;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const instRef = useRef<Instancia | null>(null);
  const vivo = useRef({ size, estado, activo });
  const [listo, setListo] = useState(false);

  useEffect(() => {
    vivo.current = { size, estado, activo };
  });

  useEffect(() => {
    let cancelado = false;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const alCambiar = (e: MediaQueryListEvent) => instRef.current?.setReducirMovimiento(e.matches);
    mq.addEventListener("change", alCambiar);
    import("./vita-3d/motor")
      .then((m) => {
        const canvas = canvasRef.current;
        if (cancelado || !canvas) return;
        const inst = m.crearInstancia({
          canvas,
          size: vivo.current.size,
          interactivo: esInteractivo,
          activo: vivo.current.activo,
          reducirMovimiento: mq.matches,
          intencion: intencionDe(vivo.current.estado),
          onListo: () => setListo(true),
        });
        instRef.current = inst;
      })
      .catch(() => {
        /* sin three/WebGL: queda el placeholder */
      });
    return () => {
      cancelado = true;
      mq.removeEventListener("change", alCambiar);
      instRef.current?.destruir();
      instRef.current = null;
    };
  }, [esInteractivo]);

  useEffect(() => {
    instRef.current?.setIntencion(intencionDe(estado));
  }, [estado]);
  useEffect(() => {
    instRef.current?.setActivo(activo);
  }, [activo]);
  useEffect(() => {
    instRef.current?.setTamano(size);
  }, [size]);

  return (
    <div
      style={{ width: size, height: size, flexShrink: 0, position: "relative" }}
      role="img"
      aria-label={ETIQUETA_ESTADO[estado]}
    >
      <Placeholder size={size} visible={!listo} />
      <canvas
        ref={canvasRef}
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: esInteractivo ? "auto" : "none",
          opacity: listo ? 1 : 0,
          transition: "opacity 200ms ease-out",
        }}
      />
    </div>
  );
}

// Cuadrado blanco cálido (paleta "nube") con ojos CSS — mismas proporciones aproximadas que el
// personaje (≈74% del ancho, apoyado abajo). Solo tokens, ningún color literal.
function Placeholder({ size, visible }: { size: number; visible: boolean }) {
  const ancho = size * 0.74;
  const alto = size * 0.66;
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        left: (size - ancho) / 2,
        top: size * 0.2,
        width: ancho,
        height: alto,
        borderRadius: "34%",
        background: "var(--vita-cuerpo)",
        opacity: visible ? 1 : 0,
        transition: "opacity 200ms ease-out",
      }}
    >
      {[0.3, 0.7].map((x) => (
        <span
          key={x}
          style={{
            position: "absolute",
            left: `${x * 100}%`,
            top: "34%",
            width: ancho * 0.1,
            height: ancho * 0.15,
            marginLeft: -ancho * 0.05,
            borderRadius: "50%",
            background: "var(--vita-ojos)",
          }}
        />
      ))}
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
