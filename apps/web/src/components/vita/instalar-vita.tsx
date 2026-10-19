"use client";

import { useSyncExternalStore } from "react";
import { VMark } from "@/components/vita/v-mark";
import { VitaIcon } from "@/lib/vita-icons";

// Banner "Instalá vita" de Home (V7). Solo aparece fuera del modo standalone
// (la PWA ya instalada no lo necesita) y se puede descartar; el descarte se
// recuerda en localStorage. iOS no tiene beforeinstallprompt: ahí se explica
// el gesto manual (Compartir → Agregar a inicio). En Android/Chrome se ofrece
// el botón "Instalar" solo si el navegador entregó beforeinstallprompt.

const CLAVE = "vita:instalar-descartado";

type EventoInstalar = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Modo = "oculto" | "ios" | "android";

let promptDiferido: EventoInstalar | null = null;
let descartadoEnSesion = false;
const oyentes = new Set<() => void>();
const avisar = () => oyentes.forEach((f) => f());

function leerDescartado(): boolean {
  try {
    return window.localStorage.getItem(CLAVE) === "1";
  } catch {
    return false;
  }
}

function estaInstalada(): boolean {
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

function esIOS(): boolean {
  const ua = window.navigator.userAgent;
  // iPadOS 13+ se identifica como Mac pero con pantalla táctil.
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && window.navigator.maxTouchPoints > 1);
}

function suscribir(cb: () => void) {
  oyentes.add(cb);
  const alPrompt = (e: Event) => {
    e.preventDefault();
    promptDiferido = e as EventoInstalar;
    avisar();
  };
  const alInstalar = () => {
    promptDiferido = null;
    avisar();
  };
  window.addEventListener("beforeinstallprompt", alPrompt);
  window.addEventListener("appinstalled", alInstalar);
  return () => {
    oyentes.delete(cb);
    window.removeEventListener("beforeinstallprompt", alPrompt);
    window.removeEventListener("appinstalled", alInstalar);
  };
}

function snapshot(): Modo {
  if (descartadoEnSesion || estaInstalada() || leerDescartado()) return "oculto";
  if (esIOS()) return "ios";
  return promptDiferido ? "android" : "oculto";
}

export function InstalarVita() {
  // En el servidor (y en la hidratación) siempre "oculto": el banner depende
  // del navegador, así que aparece recién del lado del cliente.
  const modo = useSyncExternalStore(suscribir, snapshot, () => "oculto" as Modo);

  if (modo === "oculto") return null;

  function descartar() {
    try {
      window.localStorage.setItem(CLAVE, "1");
    } catch {
      /* sin storage: se descarta solo hasta recargar */
    }
    // Sin storage el snapshot seguiría igual: se recuerda al menos en memoria.
    descartadoEnSesion = true;
    avisar();
  }

  async function instalar() {
    const evento = promptDiferido;
    if (!evento) return;
    promptDiferido = null;
    avisar();
    try {
      await evento.prompt();
      await evento.userChoice;
    } catch {
      /* el usuario cerró el diálogo */
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-[20px] bg-card py-3 pl-3 pr-2 shadow-card">
      <VMark size={40} />
      <div className="min-w-0 flex-1 text-[13px] font-medium leading-[1.4] text-foreground text-pretty">
        {modo === "ios" ? (
          <>
            Instalá vita: tocá <strong className="font-extrabold">Compartir</strong>{" "}
            <VitaIcon name="share" size={13} className="inline align-[-1px]" />{" "}
            y luego <strong className="font-extrabold">Agregar a inicio</strong>.
          </>
        ) : (
          <>Instalá vita en tu celular para abrirla como una app.</>
        )}
      </div>
      {modo === "android" && (
        <button
          type="button"
          onClick={instalar}
          className="shrink-0 rounded-full bg-primary px-3.5 py-2 text-[13px] font-extrabold text-primary-foreground"
        >
          Instalar
        </button>
      )}
      <button
        type="button"
        onClick={descartar}
        aria-label="Cerrar aviso de instalación"
        className="flex size-9 shrink-0 items-center justify-center rounded-full text-slate-brand active:bg-secondary"
      >
        <VitaIcon name="close" size={16} strokeWidth={2.6} />
      </button>
    </div>
  );
}
