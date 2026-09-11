"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useChatOverlay } from "@/lib/chat/overlay-context";
import { VitaAvatar } from "@/components/vita/v-mark";
import { VitaIcon } from "@/lib/vita-icons";
import { HistorialDrawer } from "./historial-drawer";
import { listarSesionesAction, listarMensajesAction } from "./chat-actions";
import { MensajeBurbuja, type MensajeChatUI } from "./mensaje-burbuja";
import type { SesionChat } from "@/lib/chat/tipos";

const SUGERENCIAS_INICIALES = ["Agregar medicamento", "¿Cómo vengo esta semana?", "Agendar turno"];

function mensajeBienvenida(): MensajeChatUI {
  return {
    role: "assistant",
    content: "Hola 👋 Soy vita. ¿Cómo puedo ayudarte hoy?",
    timestamp: new Date().toISOString(),
  };
}

// Overlay de pantalla completa que se monta siempre en AppShell (visible/
// oculto vía transform, no un mount/unmount condicional) para conservar la
// conversación en curso al cerrar y reabrir — mismo espíritu que el FAB
// del diseño, adaptado de ruta a overlay real.
export function VitaChatOverlay() {
  const { abierto, mensajeInicial, cerrar } = useChatOverlay();
  const cargadoRef = useRef(false); // no es estado reactivo — solo evita re-pedir sesiones
  const [sesionId, setSesionId] = useState<string | null>(null);
  const [sesiones, setSesiones] = useState<SesionChat[]>([]);
  const [mensajes, setMensajes] = useState<MensajeChatUI[]>([mensajeBienvenida()]);
  const [entrada, setEntrada] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [historialAbierto, setHistorialAbierto] = useState(false);
  const finRef = useRef<HTMLDivElement>(null);
  const ultimoNonceInicial = useRef<number | null>(null);

  // Carga el historial de sesiones recién la primera vez que se abre, no
  // en cada carga de página (el overlay está siempre montado). `cargadoRef`
  // es un ref (no estado) a propósito: marcarlo no debe disparar un
  // re-render, así que no cae en la regla de "no setState síncrono en un
  // efecto" — la única actualización de estado real acá es setSesiones,
  // dentro del .then() (async), no en el cuerpo síncrono del efecto.
  useEffect(() => {
    if (!abierto || cargadoRef.current) return;
    cargadoRef.current = true;
    listarSesionesAction()
      .then(setSesiones)
      .catch(() => {});
  }, [abierto]);

  // Nudge desde otra pantalla (ej. "¿Cómo te sentís hoy?" de Home) — se
  // suma como si vita lo preguntara, no se auto-envía en nombre del
  // usuario (evita una llamada a la API sin que el usuario haya tocado
  // nada).
  useEffect(() => {
    if (!abierto || !mensajeInicial || mensajeInicial.nonce === ultimoNonceInicial.current) return;
    ultimoNonceInicial.current = mensajeInicial.nonce;
    setMensajes((prev) => [...prev, { role: "assistant", content: mensajeInicial.texto, timestamp: new Date().toISOString() }]);
    scrollAlFinal();
  }, [abierto, mensajeInicial]);

  function scrollAlFinal() {
    requestAnimationFrame(() => finRef.current?.scrollIntoView({ behavior: "smooth" }));
  }

  async function abrirSesion(id: string) {
    setHistorialAbierto(false);
    const guardados = await listarMensajesAction(id);
    setSesionId(id);
    setMensajes(
      guardados.length > 0
        ? guardados.map((m) => ({ role: m.role, content: m.contenido, timestamp: m.created_at }))
        : [mensajeBienvenida()]
    );
  }

  function nuevoChat() {
    setHistorialAbierto(false);
    setSesionId(null);
    setMensajes([mensajeBienvenida()]);
  }

  function alBorrarHistorial() {
    setSesiones([]);
    nuevoChat();
  }

  async function enviar(texto: string) {
    const limpio = texto.trim();
    if (!limpio || enviando) return;

    const ahora = new Date().toISOString();
    setMensajes((prev) => [
      ...prev,
      { role: "user", content: limpio, timestamp: ahora },
      { role: "assistant", content: "", timestamp: ahora },
    ]);
    setEntrada("");
    setEnviando(true);
    scrollAlFinal();

    let sesionAsignada: string | null = null;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sesionId, mensaje: limpio }),
      });

      if (!res.body) throw new Error("Sin respuesta del servidor.");
      const lector = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await lector.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lineas = buffer.split("\n\n");
        buffer = lineas.pop() ?? "";

        for (const linea of lineas) {
          if (!linea.startsWith("data: ")) continue;
          const payload = linea.slice("data: ".length);
          if (payload === "[DONE]") continue;

          const evento = JSON.parse(payload) as
            | { chunk: string }
            | { action: { type: string; [clave: string]: unknown } }
            | { error: string }
            | { session: string };

          if ("session" in evento) {
            sesionAsignada = evento.session;
            setSesionId(evento.session);
          } else if ("chunk" in evento) {
            setMensajes((prev) => {
              const copia = [...prev];
              copia[copia.length - 1] = {
                ...copia[copia.length - 1],
                content: copia[copia.length - 1].content + evento.chunk,
              };
              return copia;
            });
            scrollAlFinal();
          } else if ("action" in evento) {
            setMensajes((prev) => {
              const copia = [...prev];
              copia[copia.length - 1] = { ...copia[copia.length - 1], accion: evento.action };
              return copia;
            });
            if (evento.action.type === "medication_deleted") toast.success("Medicamento eliminado.");
            if (evento.action.type === "all_medications_taken") toast.success("Marcaste todo como tomado.");
            if (evento.action.type === "medication_taken") {
              toast.success(`"${evento.action.medication_name}" marcado como tomado.`);
            }
          } else if ("error" in evento) {
            toast.error(evento.error);
          }
        }
      }
    } catch {
      toast.error("No se pudo conectar con vita. Intentá de nuevo.");
    } finally {
      setEnviando(false);
      // Siempre actualiza la entrada de la sesión activa en el drawer —
      // antes solo se agregaba cuando el servidor asignaba una sesión
      // NUEVA; seguir mandando mensajes en una sesión ya existente dejaba
      // su preview/orden desactualizados en el historial.
      const idEfectivo = sesionAsignada ?? sesionId;
      if (idEfectivo) {
        setSesiones((prev) => [
          { id: idEfectivo, created_at: ahora, updated_at: ahora, ultimoMensaje: limpio },
          ...prev.filter((s) => s.id !== idEfectivo),
        ]);
      }
    }
  }

  return (
    <>
      <div
        className={
          "fixed inset-0 z-40 flex flex-col bg-background transition-transform duration-300 ease-out " +
          (abierto ? "translate-y-0" : "pointer-events-none translate-y-full")
        }
        aria-hidden={!abierto}
      >
        <div className="flex items-center gap-3 border-b px-5 pb-3.5 pt-[max(18px,env(safe-area-inset-top))] shadow-sm">
          <VitaAvatar size={42} />
          <div className="min-w-0 flex-1">
            <div className="font-heading text-[16px] font-bold">vita</div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              en línea · siempre disponible
            </div>
          </div>
          <button
            type="button"
            onClick={() => setHistorialAbierto(true)}
            className="flex size-9 items-center justify-center rounded-full bg-muted text-foreground"
            aria-label="Historial de chats"
          >
            <VitaIcon name="clock" size={18} />
          </button>
          <button
            type="button"
            onClick={cerrar}
            className="flex size-9 items-center justify-center rounded-full bg-muted text-foreground"
            aria-label="Cerrar chat"
          >
            <VitaIcon name="close" size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {mensajes.map((m, i) => (
            <MensajeBurbuja key={i} m={m} cargando={enviando && i === mensajes.length - 1 && !m.content} />
          ))}
          {mensajes.length <= 1 && !enviando && (
            <div className="flex flex-wrap gap-1.5 pl-9 pt-1">
              {SUGERENCIAS_INICIALES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => enviar(s)}
                  className="rounded-full bg-card px-3.5 py-2 text-[13px] font-semibold text-primary shadow-[inset_0_0_0_1px_var(--border)]"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          <div ref={finRef} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            enviar(entrada);
          }}
          className="px-3.5 pb-[max(14px,env(safe-area-inset-bottom))] pt-2.5"
        >
          <div className="flex items-center gap-2 rounded-full bg-card py-1.5 pl-4 pr-1.5 shadow-[0_8px_24px_rgba(15,33,54,0.08)]">
            <input
              value={entrada}
              onChange={(e) => setEntrada(e.target.value)}
              placeholder="Contame…"
              disabled={enviando}
              className="min-w-0 flex-1 bg-transparent py-2 text-[15px] outline-none disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={!entrada.trim() || enviando}
              aria-label="Enviar"
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#22d3ee] to-[#0e7490] text-white transition-opacity disabled:from-muted disabled:to-muted disabled:text-muted-foreground"
            >
              <VitaIcon name="send" size={18} />
            </button>
          </div>
        </form>
      </div>

      <HistorialDrawer
        open={historialAbierto}
        onOpenChange={setHistorialAbierto}
        sesiones={sesiones}
        sesionActivaId={sesionId}
        onAbrirSesion={abrirSesion}
        onNuevoChat={nuevoChat}
        onHistorialBorrado={alBorrarHistorial}
      />
    </>
  );
}
