"use client";

import { useSyncExternalStore } from "react";

// "Más tarde · en 15 min" del modo simple: posponer es SOLO del cliente — se
// guarda en localStorage (con try/catch: puede no existir, o estar lleno) y
// no toca el servidor ni apaga ningún aviso. Store a nivel módulo + evento
// `storage`, mismo patrón que usar-silencio.ts, para no hacer setState en
// efectos y no romper la hidratación (el servidor siempre ve "sin posponer").
const CLAVE = "vita_simple_posponer";
export const MINUTOS_POSPONER = 15;

type Registro = { clave: string; hasta: number };

const oyentes = new Set<() => void>();
let crudo: string | null | undefined; // undefined = todavía no leído

function leer(): string | null {
  try {
    return window.localStorage.getItem(CLAVE);
  } catch {
    return null;
  }
}

function snapshot(): string | null {
  if (crudo === undefined) crudo = leer();
  return crudo;
}

function escribir(valor: string | null) {
  crudo = valor;
  try {
    if (valor === null) window.localStorage.removeItem(CLAVE);
    else window.localStorage.setItem(CLAVE, valor);
  } catch {
    // sin storage: el posponer vale solo mientras esta página siga abierta
  }
  oyentes.forEach((o) => o());
}

function suscribir(cb: () => void) {
  oyentes.add(cb);
  function alStorage(e: StorageEvent) {
    if (e.key === CLAVE || e.key === null) {
      crudo = leer();
      cb();
    }
  }
  window.addEventListener("storage", alStorage);
  return () => {
    oyentes.delete(cb);
    window.removeEventListener("storage", alStorage);
  };
}

function parsear(valor: string | null): Registro | null {
  if (!valor) return null;
  try {
    const r = JSON.parse(valor) as Partial<Registro>;
    return typeof r.clave === "string" && typeof r.hasta === "number" ? { clave: r.clave, hasta: r.hasta } : null;
  } catch {
    return null;
  }
}

// Reloj de baja frecuencia como store externo: así el componente vuelve a
// mostrar la tarjeta cuando vence el posponer sin leer Date.now() en el
// render ni sincronizar estado desde un efecto.
const PASO_RELOJ_MS = 5_000;
function suscribirReloj(cb: () => void) {
  const id = setInterval(cb, PASO_RELOJ_MS);
  return () => clearInterval(id);
}
function snapshotReloj(): number {
  return Math.floor(Date.now() / PASO_RELOJ_MS) * PASO_RELOJ_MS;
}

/**
 * Posponer la tarjeta de la dosis `clave` (ids de la dosis separados por
 * coma): si las dosis cambian, la clave cambia y el posponer anterior deja de
 * aplicar solo.
 */
export function usePosponer(clave: string) {
  const guardado = useSyncExternalStore(suscribir, snapshot, () => null);
  const ahora = useSyncExternalStore(suscribirReloj, snapshotReloj, () => 0);

  const registro = parsear(guardado);
  const hasta = registro && registro.clave === clave ? registro.hasta : null;
  const posponido = hasta !== null && hasta > ahora;
  const minutosRestantes = hasta !== null && posponido ? Math.max(1, Math.ceil((hasta - ahora) / 60_000)) : 0;

  return {
    posponido,
    minutosRestantes,
    posponer: () => escribir(JSON.stringify({ clave, hasta: Date.now() + MINUTOS_POSPONER * 60_000 } satisfies Registro)),
    cancelar: () => escribir(null),
  };
}
