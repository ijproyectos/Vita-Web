"use client";

import { useReportWebVitals } from "next/web-vitals";
import { METRICAS_VITALS, MAX_METRICAS_POR_ENVIO } from "@/lib/vitals/constantes";
import type { EnvioVitals } from "@/lib/vitals/logica";

// Medicion de velocidad real (Core Web Vitals) de quien usa la app. Anonima: se manda la ruta (el
// servidor le saca ids y query), la metrica, el valor y la calificacion; nada de la persona. LCP, INP y
// CLS se van actualizando durante la visita, asi que se juntan y se envian UNA vez cuando la pagina
// pasa a segundo plano o se cierra (`sendBeacon`, con `fetch keepalive` de respaldo). Limitacion
// conocida: INP y CLS se acumulan en toda la visita y quedan atribuidos a la ultima ruta vista.
// No renderiza nada y nunca interfiere con la app.

type Pendiente = EnvioVitals["metricas"][number];

const pendientes = new Map<string, { ruta: string; metrica: Pendiente }>();
let escuchando = false;

function enviar() {
  if (pendientes.size === 0) return;
  const porRuta = new Map<string, Pendiente[]>();
  for (const { ruta, metrica } of pendientes.values()) {
    porRuta.set(ruta, [...(porRuta.get(ruta) ?? []), metrica]);
  }
  pendientes.clear();

  for (const [ruta, metricas] of porRuta) {
    for (let i = 0; i < metricas.length; i += MAX_METRICAS_POR_ENVIO) {
      const cuerpo = JSON.stringify({ ruta, metricas: metricas.slice(i, i + MAX_METRICAS_POR_ENVIO) } satisfies EnvioVitals);
      try {
        const ok = navigator.sendBeacon?.("/api/vitals", new Blob([cuerpo], { type: "application/json" }));
        if (!ok) void fetch("/api/vitals", { method: "POST", body: cuerpo, keepalive: true, headers: { "Content-Type": "application/json" } }).catch(() => {});
      } catch {
        // La medicion nunca debe romper nada.
      }
    }
  }
}

function alReportar(metric: { name: string; value: number; rating?: string; navigationType?: string }) {
  if (process.env.NODE_ENV !== "production") return;
  if (!(METRICAS_VITALS as readonly string[]).includes(metric.name)) return;
  if (metric.rating !== "good" && metric.rating !== "needs-improvement" && metric.rating !== "poor") return;
  const ruta = window.location.pathname;
  pendientes.set(`${ruta}|${metric.name}`, {
    ruta,
    metrica: {
      nombre: metric.name as Pendiente["nombre"],
      valor: metric.value,
      rating: metric.rating,
      navegacion: metric.navigationType,
    },
  });
  if (!escuchando) {
    escuchando = true;
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") enviar();
    });
    window.addEventListener("pagehide", enviar);
  }
}

export function ReportarVitals() {
  useReportWebVitals(alReportar);
  return null;
}
