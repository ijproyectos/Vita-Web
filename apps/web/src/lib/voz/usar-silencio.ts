"use client";

import { useSyncExternalStore } from "react";

// Preferencia a nivel dispositivo: "vita silenciada" apaga TODO el audio de
// vita (hablar y escuchar). Store mínimo a nivel módulo + evento `storage`
// para que todos los componentes montados (chat, modo simple) queden en
// sincronía sin setState en efectos.
//
// Sin preferencia guardada, cada pantalla decide el valor por defecto: el
// chat normal arranca con sonido y el modo simple arranca silenciado (la
// persona lo prende desde Ajustes). Tocar el interruptor guarda la elección
// explícita y vale para las dos.
const CLAVE = "vita_silenciada";

const oyentes = new Set<() => void>();
// "1" silenciada, "0" con sonido, "" sin elección guardada.
type Guardado = "1" | "0" | "";
let valor: Guardado | null = null; // null = todavía no leído de localStorage

function leer(): Guardado {
  try {
    const v = window.localStorage.getItem(CLAVE);
    return v === "1" || v === "0" ? v : "";
  } catch {
    return "";
  }
}

function snapshot(): Guardado {
  if (valor === null) valor = leer();
  return valor;
}

export function silenciadaEfectiva(guardado: Guardado, porDefecto: boolean): boolean {
  return guardado === "" ? porDefecto : guardado === "1";
}

function avisar() {
  oyentes.forEach((o) => o());
}

function escribir(nuevo: boolean) {
  valor = nuevo ? "1" : "0";
  try {
    window.localStorage.setItem(CLAVE, nuevo ? "1" : "0");
  } catch {
    // sin storage: la preferencia vale solo para esta sesión de la página
  }
  avisar();
}

function suscribir(cb: () => void) {
  oyentes.add(cb);
  function alStorage(e: StorageEvent) {
    if (e.key === CLAVE || e.key === null) {
      valor = leer();
      cb();
    }
  }
  window.addEventListener("storage", alStorage);
  return () => {
    oyentes.delete(cb);
    window.removeEventListener("storage", alStorage);
  };
}

function setSilenciada(nuevo: boolean) {
  escribir(nuevo);
}

export function useSilencioVita({ porDefecto = false }: { porDefecto?: boolean } = {}) {
  const guardado = useSyncExternalStore(suscribir, snapshot, () => "" as Guardado);
  const silenciada = silenciadaEfectiva(guardado, porDefecto);
  const alternar = () => escribir(!silenciadaEfectiva(snapshot(), porDefecto));
  return { silenciada, alternar, setSilenciada };
}
