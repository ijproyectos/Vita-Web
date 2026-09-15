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
import { useGrabacionVoz } from "@/lib/voz/usar-grabacion-voz";
import { hablarTexto } from "@/lib/voz/hablar-cliente";
import type { EstadoVoz } from "@/lib/voz/tipos";

const SUGERENCIAS_INICIALES = ["Contame mi día", "Agregar medicamento", "Agendar turno"];

function mensajeBienvenida(): MensajeChatUI {
  return {
    role: "assistant",
    content: "Hola 👋 Soy vita. ¿Cómo puedo ayudarte hoy?",
    timestamp: new Date().toISOString(),
  };
}

// Etiqueta de estado que reemplaza "en línea · siempre disponible" mientras
// el modo voz está activo — "hablando" no viene del hook (es propio del
// overlay, que es quien maneja el TTS), por eso se recibe aparte.
function etiquetaEstadoVoz(estado: EstadoVoz, hablando: boolean): string {
  if (hablando) return "vita está hablando…";
  switch (estado) {
    case "grabando":
      return "te estoy escuchando…";
    case "procesando":
      return "transcribiendo tu mensaje…";
    default:
      return "modo voz activo — hablá cuando quieras";
  }
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
  const [modoVoz, setModoVoz] = useState(false);
  const [hablando, setHablando] = useState(false);
  const finRef = useRef<HTMLDivElement>(null);
  const ultimoNonceInicial = useRef<number | null>(null);
  const modoVozRef = useRef(false); // valor fresco de modoVoz para leer dentro del callback async de la voz
  const mensajesRef = useRef<MensajeChatUI[]>(mensajes); // idem, para leer la última respuesta de vita ya resuelta
  const reanudarEscuchaRef = useRef<() => void>(() => {});

  useEffect(() => {
    modoVozRef.current = modoVoz;
  }, [modoVoz]);

  useEffect(() => {
    mensajesRef.current = mensajes;
  }, [mensajes]);

  // Un turno de voz completo: transcribir ya lo hizo el hook, acá se manda
  // el texto por el mismo enviar() de siempre, se lee la respuesta final
  // de vita (del ref, no del closure — enviar() actualiza mensajes de a
  // chunks) y se la lee en voz alta antes de retomar la escucha.
  async function onTranscripcionVoz(texto: string) {
    await enviar(texto);
    const ultimo = mensajesRef.current[mensajesRef.current.length - 1];
    if (ultimo?.role === "assistant" && ultimo.content) {
      setHablando(true);
      await hablarTexto(ultimo.content);
      setHablando(false);
    }
    if (modoVozRef.current) reanudarEscuchaRef.current();
  }

  const {
    estado: estadoVoz,
    iniciar: iniciarVoz,
    detener: detenerVoz,
    reanudarEscucha,
  } = useGrabacionVoz({
    onTranscripcion: onTranscripcionVoz,
    onError: (mensaje) => toast.error(mensaje),
  });

  useEffect(() => {
    reanudarEscuchaRef.current = reanudarEscucha;
  }, [reanudarEscucha]);

  // El overlay nunca se desmonta (solo se oculta vía transform), así que
  // cerrar el chat no corta el micrófono por sí solo — `cerrar()` del
  // contexto solo se invoca desde el botón de cerrar de este mismo
  // componente (ningún otro lugar de la app cierra el overlay), así que
  // frenar la voz acá, en el handler del botón, cubre el 100% de los
  // casos sin necesitar un efecto que reaccione a `abierto`.
  function cerrarChat() {
    if (modoVoz) {
      detenerVoz();
      if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
      setModoVoz(false);
      setHablando(false);
    }
    cerrar();
  }

  async function alternarModoVoz() {
    if (modoVoz) {
      detenerVoz();
      if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
      setModoVoz(false);
      setHablando(false);
      return;
    }

    const resultado = await iniciarVoz();
    if (!resultado.ok) {
      toast.error(
        resultado.motivo === "permiso-denegado"
          ? "Necesitamos acceso al micrófono para el modo voz."
          : "Tu navegador no soporta grabación de voz."
      );
      return;
    }
    setModoVoz(true);
  }

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
            if (evento.action.type === "profile_updated") toast.success("Perfil de salud actualizado.");
            if (evento.action.type === "condition_added") {
              toast.success(`"${evento.action.label}" agregada a tus condiciones.`);
            }
            if (evento.action.type === "allergy_added") {
              toast.success(`"${evento.action.name}" agregada a tus alergias.`);
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
              {modoVoz ? etiquetaEstadoVoz(estadoVoz, hablando) : "en línea · siempre disponible"}
            </div>
          </div>
          <button
            type="button"
            onClick={alternarModoVoz}
            aria-pressed={modoVoz}
            aria-label={modoVoz ? "Desactivar modo voz" : "Activar modo voz (manos libres)"}
            className={
              "flex size-9 items-center justify-center rounded-full transition-colors " +
              (modoVoz
                ? "bg-gradient-to-br from-[#22d3ee] to-[#0e7490] text-white " +
                  (estadoVoz === "grabando" || hablando ? "animate-pulse" : "")
                : "bg-muted text-foreground")
            }
          >
            <VitaIcon name="mic" size={18} />
          </button>
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
            onClick={cerrarChat}
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
