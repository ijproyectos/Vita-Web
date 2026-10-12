"use client";

import { useSyncExternalStore } from "react";

// Preferencia a nivel dispositivo: "vita silenciada" apaga TODO el audio de
// vita (hablar y escuchar). Store mínimo a nivel módulo + evento `storage`
// para que todos los componentes montados (chat, modo simple) queden en
// sincronía sin setState en efectos.
const CLAVE = "vita_silenciada";

const oyentes = new Set<() => void>();
let valor: boolean | null = null; // null = todavía no leído de localStorage

function leer(): boolean {
  try {
    return window.localStorage.getItem(CLAVE) === "1";
  } catch {
    return false;
  }
}

function snapshot(): boolean {
  if (valor === null) valor = leer();
  return valor;
}

function avisar() {
  oyentes.forEach((o) => o());
}

function escribir(nuevo: boolean) {
  valor = nuevo;
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

function alternar() {
  escribir(!snapshot());
}

export function useSilencioVita() {
  const silenciada = useSyncExternalStore(suscribir, snapshot, () => false);
  return { silenciada, alternar, setSilenciada };
}
