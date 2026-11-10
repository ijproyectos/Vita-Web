"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { VitaAvatar } from "@/components/vita/vita-avatar";
import { cn } from "@/lib/utils";
import { CLAVE_TOUR_VISTO, pasosTour, pasosVisibles, posicionGlobo, type Caja, type PasoTour } from "@/lib/tour/pasos";

const ANCHO_APP = 448;
const SOMBRA_FONDO = "color-mix(in srgb, var(--ink) 70%, transparent)";

function elementoDe(clave: string): Element | null {
  const el = document.querySelector(`[data-tour="${clave}"]`);
  const r = el?.getBoundingClientRect();
  return r && r.width > 0 && r.height > 0 ? el! : null;
}

// Recorrido de la primera vez. Solo se monta cuando Inicio llega con `?tour=1`,
// que únicamente manda el final del onboarding. Se marca visto al mostrarse: si
// recarga o sale a la mitad, no vuelve a aparecer.
export function TourPrimeraVez({ nombre }: { nombre: string }) {
  const [pasos, setPasos] = useState<PasoTour[] | null>(null);
  const [indice, setIndice] = useState(0);
  const [caja, setCaja] = useState<Caja | null>(null);
  const [alto, setAlto] = useState(800);
  const [ancho, setAncho] = useState(400);
  const siguienteRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    window.history.replaceState(null, "", "/app");
    // Se marca al mostrarlo, no antes: si este efecto corre dos veces, el primer
    // temporizador se cancela y el tour tiene que seguir apareciendo.
    const t = setTimeout(() => {
      try {
        if (localStorage.getItem(CLAVE_TOUR_VISTO)) return;
        localStorage.setItem(CLAVE_TOUR_VISTO, "1");
      } catch {
        // Sin almacenamiento igual se muestra: llegó recién del onboarding.
      }
      setPasos(pasosVisibles(pasosTour(nombre), (c) => elementoDe(c) !== null));
    }, 700);
    return () => clearTimeout(t);
  }, [nombre]);

  const paso = pasos?.[indice] ?? null;

  const medir = useCallback(() => {
    setAlto(window.innerHeight);
    setAncho(window.innerWidth);
    if (!paso?.clave) return setCaja(null);
    const r = elementoDe(paso.clave)?.getBoundingClientRect();
    setCaja(r ? { x: r.left - paso.margen, y: r.top - paso.margen, w: r.width + paso.margen * 2, h: r.height + paso.margen * 2 } : null);
  }, [paso]);

  useEffect(() => {
    if (!paso) return;
    if (paso.clave) elementoDe(paso.clave)?.scrollIntoView({ block: "center", behavior: "instant" });
    const medicion = setTimeout(medir, 0);
    window.addEventListener("resize", medir);
    window.addEventListener("scroll", medir, true);
    return () => {
      clearTimeout(medicion);
      window.removeEventListener("resize", medir);
      window.removeEventListener("scroll", medir, true);
    };
  }, [paso, medir]);

  const terminar = useCallback(() => setPasos(null), []);

  useEffect(() => {
    if (!paso) return;
    siguienteRef.current?.focus();
    const alTeclear = (e: KeyboardEvent) => e.key === "Escape" && terminar();
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [paso, terminar]);

  if (!pasos || !paso) return null;

  const siguiente = () => (indice + 1 < pasos.length ? setIndice(indice + 1) : terminar());
  const cierre = paso.clave === null;
  const { top, flechaArriba } = posicionGlobo(cierre ? null : caja, alto);
  const margenLateral = Math.max(16, (ancho - ANCHO_APP) / 2 + 16);
  const flechaX = caja ? Math.max(20, Math.min(ancho - margenLateral * 2 - 36, caja.x + caja.w / 2 - margenLateral - 8)) : 20;
  const conSpot = !cierre && caja;

  return (
    <div role="dialog" aria-modal="true" aria-label="Recorrido por vita" className="fixed inset-0 z-[70]">
      {conSpot ? (
        <div
          onClick={siguiente}
          className="absolute cursor-pointer transition-all duration-[450ms] ease-out motion-reduce:transition-none"
          style={{ left: caja.x, top: caja.y, width: caja.w, height: caja.h, borderRadius: paso.radio, boxShadow: `0 0 0 2000px ${SOMBRA_FONDO}, 0 0 0 3px var(--card)` }}
        />
      ) : (
        <div className="absolute inset-0" style={{ background: SOMBRA_FONDO }} />
      )}
      <div className="absolute transition-[top] duration-[450ms] ease-out motion-reduce:transition-none" style={{ left: margenLateral, right: margenLateral, top }}>
        <div className="relative flex flex-col gap-3.5 rounded-[22px] bg-card p-4 shadow-card">
          {conSpot && flechaArriba !== null && (
            <div aria-hidden className={cn("absolute size-4 rotate-45 rounded-[3px] bg-card", flechaArriba ? "-top-[7px]" : "-bottom-[7px]")} style={{ left: flechaX }} />
          )}
          <div className="relative flex items-start gap-3" aria-live="polite">
            <div className="shrink-0 overflow-hidden rounded-[16px] bg-cream">
              <VitaAvatar size={cierre ? 64 : 44} estado={cierre ? "happy" : "idle"} interactivo={false} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="eyebrow text-primary">{paso.eyebrow}</div>
              <div className="mt-[3px] text-pretty font-heading text-[16.5px] font-extrabold leading-[1.25] tracking-[-0.02em]">{paso.titulo}</div>
              <div className="mt-1 text-pretty text-[13px] font-medium leading-[1.45] text-slate-brand">{paso.texto}</div>
            </div>
          </div>
          <div className="relative flex items-center justify-between gap-2.5">
            <div className="flex gap-[5px]" aria-hidden>
              {pasos.map((p, i) => (
                <div key={p.eyebrow} className={cn("h-1.5 rounded-full transition-all motion-reduce:transition-none", i === indice ? "w-[18px] bg-primary" : "w-1.5 bg-line")} />
              ))}
            </div>
            <div className="flex items-center gap-1">
              {!cierre && (
                <button type="button" onClick={terminar} className="px-3 py-[11px] text-[13px] font-bold text-subtle">
                  Saltar
                </button>
              )}
              <button ref={siguienteRef} type="button" onClick={siguiente} className="rounded-full bg-primary px-5 py-[11px] text-[13.5px] font-extrabold text-primary-foreground shadow-cta-sm">
                {cierre ? "Empezar" : indice === pasos.length - 2 ? "Último" : "Siguiente"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
