"use client";

import { useEffect, useRef } from "react";
import { cerrarSesionPorInactividadAction } from "../../acciones-sesion";

const LIMITE_MS = 30 * 60_000;
const REVISAR_CADA_MS = 15_000;
const EVENTOS = ["pointerdown", "pointermove", "keydown", "scroll", "touchstart"] as const;

// Cierra la sesión del panel tras 30 minutos sin actividad del usuario (puntero, teclado, scroll o volver a la
// pestaña). Se compara contra un reloj de pared, no contra un setTimeout largo: las pestañas en segundo plano
// frenan los timers, y al volver la comparación igual detecta que pasó el tiempo. La cookie del servidor vence por
// su cuenta (el proxy la corre en cada vista), esto solo evita dejar el panel abierto y a la vista.
export function InactividadAdmin() {
  const ultima = useRef(0);
  const cerrando = useRef(false);

  useEffect(() => {
    ultima.current = Date.now();
    const marcar = () => {
      ultima.current = Date.now();
    };
    const revisar = () => {
      if (cerrando.current) return;
      if (Date.now() - ultima.current >= LIMITE_MS) {
        cerrando.current = true;
        void cerrarSesionPorInactividadAction();
      }
    };
    const alCambiarVisibilidad = () => {
      if (document.visibilityState === "visible") revisar();
    };
    for (const e of EVENTOS) window.addEventListener(e, marcar, { passive: true });
    document.addEventListener("visibilitychange", alCambiarVisibilidad);
    const intervalo = window.setInterval(revisar, REVISAR_CADA_MS);
    return () => {
      for (const e of EVENTOS) window.removeEventListener(e, marcar);
      document.removeEventListener("visibilitychange", alCambiarVisibilidad);
      window.clearInterval(intervalo);
    };
  }, []);

  return null;
}
