"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

// {texto, nonce} en vez de un string pelado: llamar abrir() dos veces
// seguidas con el MISMO texto (ej. tocar el nudge "¿Cómo te sentís hoy?"
// de nuevo después de cerrar el chat) no cambia el valor de un string
// state — React ni re-renderiza, así que el segundo nudge nunca se
// inyectaba (hallazgo del review). El nonce garantiza una referencia
// nueva en cada llamada, texto repetido o no.
type MensajeInicial = { texto: string; nonce: number } | null;

type ChatOverlayContextValue = {
  abierto: boolean;
  mensajeInicial: MensajeInicial;
  abrir: (mensajeInicial?: string) => void;
  cerrar: () => void;
};

const ChatOverlayContext = createContext<ChatOverlayContextValue | null>(null);

// Contexto para abrir el chat con vita como overlay desde cualquier
// pantalla de /app/* (el FAB del bottom nav, el nudge de Home, "Pedir a
// vita" en Rutina, "Agregar por voz" en los forms) — reemplaza la ruta
// /app/chat del pase anterior, que en este diseño es un modal, no una
// página.
export function ChatOverlayProvider({ children }: { children: ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  const [mensajeInicial, setMensajeInicial] = useState<MensajeInicial>(null);

  return (
    <ChatOverlayContext.Provider
      value={{
        abierto,
        mensajeInicial,
        abrir: (mensaje) => {
          setMensajeInicial(mensaje ? { texto: mensaje, nonce: Date.now() } : null);
          setAbierto(true);
        },
        cerrar: () => setAbierto(false),
      }}
    >
      {children}
    </ChatOverlayContext.Provider>
  );
}

export function useChatOverlay() {
  const ctx = useContext(ChatOverlayContext);
  if (!ctx) throw new Error("useChatOverlay debe usarse dentro de ChatOverlayProvider");
  return ctx;
}
