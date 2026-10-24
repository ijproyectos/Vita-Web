"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { esAccionDeEscritura } from "@/lib/ai/acciones-escritura";
import { useChatOverlay } from "@/lib/chat/overlay-context";
import { VitaAvatar } from "@/components/vita/v-mark";
import type { EstadoAvatar } from "@/components/vita/estados-avatar";
import { VitaIcon } from "@/lib/vita-icons";
import { HistorialDrawer } from "./historial-drawer";
import { listarSesionesAction, listarMensajesAction, obtenerUsoHoyAction } from "./chat-actions";
import { BarraUso, barraUsoTono, textoRestante } from "@/components/uso-ia/barra-uso";
import type { UsoDiario } from "@/lib/uso-ia/tipos";
import { MensajeBurbuja, type MensajeChatUI } from "./mensaje-burbuja";
import type { SesionChat } from "@/lib/chat/tipos";
import { useSilencioVita } from "@/lib/voz/usar-silencio";
import { useGrabacionVoz } from "@/lib/voz/usar-grabacion-voz";
import { desbloquearVoz, cancelarVoz, obtenerAudioBlob, reproducirBlob, extraerFrasesListas } from "@/lib/voz/hablar-cliente";
import type { EstadoVoz } from "@/lib/voz/tipos";
import { fechaDeHoyISO, formatoFechaCorta } from "@/lib/rutina/formato";

type ItemHabla = { texto: string; audioPromise: Promise<Blob | null> };

// Copy del diseño V7 ("Mi rutina de hoy" / "Agendar turno"). El chip "Registrar presión"
// del mock no está: vita todavía no tiene una herramienta para cargar mediciones.
const SUGERENCIAS_INICIALES = ["Mi rutina de hoy", "Agregar medicamento", "Agendar turno"];

// Mapea el mood decidido por la tool set_avatar_mood (lib/ai/tools.ts) al
// subconjunto "emocional" de EstadoAvatar — nunca listening/thinking/
// speaking, esos los decide este overlay en base al estado real de la
// conversación (ver estadoAvatarHeader más abajo), no el modelo.
const MOOD_A_ESTADO: Record<string, EstadoAvatar> = {
  neutral: "idle",
  happy: "happy",
  empathetic: "empathetic",
  calm: "calm",
  alert: "alert",
};
function moodValido(mood: unknown): EstadoAvatar {
  return MOOD_A_ESTADO[typeof mood === "string" ? mood : "neutral"] ?? "idle";
}

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
export function VitaChatOverlay({ esPropio, nombreActivo }: { esPropio: boolean; nombreActivo: string }) {
  const router = useRouter();
  const { abierto, mensajeInicial, cerrar } = useChatOverlay();
  const cargadoRef = useRef(false); // no es estado reactivo — solo evita re-pedir sesiones
  const [sesionId, setSesionId] = useState<string | null>(null);
  const [sesiones, setSesiones] = useState<SesionChat[]>([]);
  const [mensajes, setMensajes] = useState<MensajeChatUI[]>([mensajeBienvenida()]);
  const [entrada, setEntrada] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [historialAbierto, setHistorialAbierto] = useState(false);
  const { silenciada, alternar: alternarSilencio } = useSilencioVita();
  const [modoVoz, setModoVoz] = useState(false);
  const [hablando, setHablando] = useState(false);
  const [uso, setUso] = useState<UsoDiario | null>(null); // null = oculto (sin dato)
  // Último mood que decidió vita (set_avatar_mood) — no se toca por
  // escuchar/pensar/hablar, solo lo actualiza cada respuesta nueva del
  // asistente; el estado final del avatar (más abajo) le da prioridad a
  // listening/thinking/speaking, que reflejan la conversación en curso.
  // "Escribiendo": se prende en el onChange del input y se apaga con un
  // timeout (ref) ~1.5 s después de la última tecla — nunca desde un efecto.
  const [escribiendo, setEscribiendo] = useState(false);
  const timeoutEscribiendoRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [moodAvatar, setMoodAvatar] = useState<EstadoAvatar>("idle");
  const finRef = useRef<HTMLDivElement>(null);
  const ultimoNonceInicial = useRef<number | null>(null);
  const modoVozRef = useRef(false); // valor fresco de modoVoz para leer dentro del callback async de la voz
  const reanudarEscuchaRef = useRef<() => void>(() => {});
  const fraseHabladaIndiceRef = useRef(0); // cuánto del texto en streaming ya se mandó a hablar
  const colaHablaRef = useRef<ItemHabla[]>([]);
  const colaEnCursoRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    modoVozRef.current = modoVoz;
  }, [modoVoz]);

  // Encola una frase para hablar: el fetch a Deepgram arranca ya (en
  // paralelo a lo que se esté reproduciendo), la reproducción respeta el
  // orden de llegada — así el silencio entre frases es solo el tiempo que
  // falte de red, no el fetch completo de la siguiente.
  function encolarFraseVoz(frase: string) {
    colaHablaRef.current.push({ texto: frase, audioPromise: obtenerAudioBlob(frase) });
    if (!colaEnCursoRef.current) {
      colaEnCursoRef.current = procesarColaHabla().finally(() => {
        colaEnCursoRef.current = null;
      });
    }
  }

  async function procesarColaHabla() {
    setHablando(true);
    while (colaHablaRef.current.length > 0) {
      const item = colaHablaRef.current.shift();
      if (!item) break;
      await reproducirBlob(await item.audioPromise);
    }
    setHablando(false);
  }

  function cortarHabla() {
    colaHablaRef.current = [];
    cancelarVoz();
  }

  // Un turno de voz completo: transcribir ya lo hizo el hook. enviar() va
  // encolando cada oración a medida que el streaming de texto la completa
  // (no espera a la respuesta entera), acá solo queda esperar a que la cola
  // de habla termine de reproducirse antes de retomar la escucha.
  async function onTranscripcionVoz(texto: string) {
    await enviar(texto);
    if (colaEnCursoRef.current) await colaEnCursoRef.current;
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
      cortarHabla();
      setModoVoz(false);
      setHablando(false);
    }
    cerrar();
  }

  // Escape cierra el chat. Se lee cerrarChat vía ref (actualizada en un
  // efecto, nunca durante el render) para no re-suscribir el listener en
  // cada render. Con el drawer de historial abierto, Escape lo cierra a él
  // (lo maneja el propio Sheet) y no al chat entero.
  const cerrarChatRef = useRef(cerrarChat);
  useEffect(() => {
    cerrarChatRef.current = cerrarChat;
  });
  useEffect(() => {
    if (!abierto || historialAbierto) return;
    function alPresionar(e: KeyboardEvent) {
      if (e.key === "Escape") cerrarChatRef.current();
    }
    window.addEventListener("keydown", alPresionar);
    return () => window.removeEventListener("keydown", alPresionar);
  }, [abierto, historialAbierto]);

  // Silenciar corta todo en el mismo click (nada de efectos): habla en
  // curso, cola pendiente, modo voz y micrófono. Desilenciar NO reactiva la
  // voz — el usuario la vuelve a prender a mano con el micrófono.
  function alternarSilenciada() {
    if (!silenciada) {
      modoVozRef.current = false;
      detenerVoz();
      cortarHabla();
      setModoVoz(false);
      setHablando(false);
    }
    alternarSilencio();
  }

  async function alternarModoVoz() {
    if (silenciada) return;
    if (modoVoz) {
      detenerVoz();
      cortarHabla();
      setModoVoz(false);
      setHablando(false);
      return;
    }

    // Tiene que ser lo primero, todavía dentro del gesto sincrónico del
    // click — después de este punto todo es async (getUserMedia, etc.) y
    // en Safari/iOS ya sería tarde para desbloquear el motor de voz.
    desbloquearVoz();

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
    obtenerUsoHoyAction()
      .then(setUso)
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

  // Reintentar = mismo texto y MISMO pedidoId, sin burbuja de usuario nueva: el
  // servidor reconoce el pedido y no repite lo que ya escribió.
  function reintentar(m: MensajeChatUI) {
    if (m.pedidoId) enviar(m.content, m.pedidoId);
  }

  async function enviar(texto: string, pedidoReintentado?: string) {
    const limpio = texto.trim();
    if (!limpio || enviando || (uso && uso.restantes <= 0)) return;

    const ahora = new Date().toISOString();
    const pedidoId = pedidoReintentado ?? crypto.randomUUID();
    let fallo = false;
    setMensajes((prev) =>
      pedidoReintentado
        ? [
            ...prev.map((m) => (m.pedidoId === pedidoId ? { ...m, sinRespuesta: false } : m)),
            { role: "assistant" as const, content: "", timestamp: ahora },
          ]
        : [
            ...prev,
            { role: "user" as const, content: limpio, timestamp: ahora, pedidoId },
            { role: "assistant" as const, content: "", timestamp: ahora },
          ]
    );
    setEntrada("");
    if (timeoutEscribiendoRef.current) clearTimeout(timeoutEscribiendoRef.current);
    setEscribiendo(false);
    setEnviando(true);
    scrollAlFinal();

    let sesionAsignada: string | null = null;
    let textoAcumulado = "";
    let huboEscritura = false; // refresca las pantallas UNA vez al terminar la respuesta
    if (modoVozRef.current) fraseHabladaIndiceRef.current = 0;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sesionId, mensaje: limpio, pedidoId, reintento: !!pedidoReintentado }),
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
            | { session: string }
            | { uso: UsoDiario };

          if ("session" in evento) {
            sesionAsignada = evento.session;
            setSesionId(evento.session);
          } else if ("uso" in evento) {
            setUso(evento.uso);
          } else if ("chunk" in evento) {
            textoAcumulado += evento.chunk;
            setMensajes((prev) => {
              const copia = [...prev];
              copia[copia.length - 1] = {
                ...copia[copia.length - 1],
                content: copia[copia.length - 1].content + evento.chunk,
              };
              return copia;
            });
            scrollAlFinal();
            // Habla por oración a medida que el streaming la completa, no
            // espera a la respuesta entera — pedido explícito del usuario
            // (que "conteste antes", no de un bloque al final).
            if (modoVozRef.current) {
              const { frases, hastaIndice } = extraerFrasesListas(textoAcumulado, fraseHabladaIndiceRef.current);
              fraseHabladaIndiceRef.current = hastaIndice;
              frases.forEach(encolarFraseVoz);
            }
          } else if ("action" in evento) {
            // avatar_mood es puramente visual (no una tarjeta de acción) —
            // se maneja aparte para no pisar el `accion` real de la burbuja
            // cuando el modelo llama las dos tools en el mismo turno.
            if (evento.action.type === "avatar_mood") {
              setMoodAvatar(moodValido(evento.action.mood));
              continue;
            }
            if (esAccionDeEscritura(evento.action.type)) huboEscritura = true;
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
            fallo = true;
            toast.error(evento.error);
          }
        }
      }

      // Lo que haya quedado sin punto final (el cierre de la respuesta,
      // que raramente termina justo en un terminador de oración) también
      // se habla — si no, la última frase de vita se pierde en silencio.
      if (modoVozRef.current) {
        const restante = textoAcumulado.slice(fraseHabladaIndiceRef.current).trim();
        if (restante) encolarFraseVoz(restante);
      }
    } catch {
      fallo = true;
      toast.error("No se pudo conectar con vita. Intentá de nuevo.");
    } finally {
      setEnviando(false);
      // Sin respuesta: el mensaje queda marcado para reintentarlo con el mismo
      // pedido; la burbuja vacía de vita se saca para no dejar un hueco.
      if (fallo) {
        setMensajes((prev) => {
          const sinHueco = prev.length > 0 && prev[prev.length - 1].role === "assistant" && !prev[prev.length - 1].content
            ? prev.slice(0, -1)
            : prev;
          return sinHueco.map((m) => (m.pedidoId === pedidoId ? { ...m, sinRespuesta: true } : m));
        });
      }
      // Las pantallas (Home, Rutina, Mi Salud...) son Server Components: sin
      // esto siguen mostrando lo de antes de que vita escribiera. Va acá y no
      // al final del try: si el stream se corta después de una escritura, el
      // dato ya quedó guardado y la pantalla igual tiene que mostrarlo.
      if (huboEscritura) router.refresh();
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

  function alCambiarEntrada(valor: string) {
    setEntrada(valor);
    if (timeoutEscribiendoRef.current) clearTimeout(timeoutEscribiendoRef.current);
    if (valor.trim() === "") {
      setEscribiendo(false);
      return;
    }
    setEscribiendo(true);
    timeoutEscribiendoRef.current = setTimeout(() => setEscribiendo(false), 1500);
  }

  // Prioridad: lo que está pasando AHORA en la conversación (hablando >
  // escuchando > pensando > escribiendo) siempre gana sobre el mood — un "feliz" viejo no
  // debe taparse la voz/escucha real, y tampoco tiene sentido mostrarlo
  // mientras vita todavía está pensando la respuesta que lo va a decidir.
  const estadoAvatarHeader: EstadoAvatar = hablando
    ? "speaking"
    : estadoVoz === "grabando"
      ? "listening"
      : estadoVoz === "procesando" || enviando
        ? "thinking"
        : escribiendo && entrada.trim() !== ""
          ? "typing"
          : moodAvatar;

  const agotado = !!uso && uso.restantes <= 0;
  const vacio = mensajes.length <= 1 && !enviando;

  return (
    <>
      {/* Cerrado: `inert` saca todo el subárbol del foco/teclado/lectores
          de pantalla, y `invisible` lo oculta de verdad (no solo fuera de
          pantalla) — con un delay igual a la animación para que el slide
          de salida se vea completo antes de ocultarse. */}
      <div
        className={
          "fixed inset-0 z-40 flex flex-col bg-background " +
          (abierto
            ? "visible translate-y-0 [transition:transform_300ms_ease-out,visibility_0s]"
            : "invisible pointer-events-none translate-y-full [transition:transform_300ms_ease-out,visibility_0s_300ms]")
        }
        inert={!abierto}
      >
        <div className="flex items-center gap-3 bg-card px-5 pb-3.5 pt-[max(18px,env(safe-area-inset-top))] shadow-item">
          {/* Con conversación en curso: avatar de 76px en el header. En el
              estado vacío el protagonista es el hero de abajo (170px). */}
          {!vacio && <VitaAvatar size={76} estado={estadoAvatarHeader} activo={abierto} />}
          <div className="min-w-0 flex-1">
            <div className="font-heading text-[19px] font-extrabold leading-none tracking-[-0.05em]">
              vi<span className="text-primary">ta</span>
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-[11.5px] font-medium text-subtle">
              <span className="size-1.5 rounded-full bg-online" />
              {silenciada
                ? "silenciada · solo texto"
                : modoVoz
                  ? etiquetaEstadoVoz(estadoVoz, hablando)
                  : "en línea · siempre disponible"}
            </div>
          </div>
          <button
            type="button"
            onClick={alternarSilenciada}
            aria-pressed={silenciada}
            aria-label={silenciada ? "Activar la voz de vita" : "Silenciar a vita"}
            title={silenciada ? "Activar la voz de vita" : "Silenciar a vita"}
            className={
              "flex size-9 items-center justify-center rounded-full " +
              (silenciada ? "bg-aviso-tint text-aviso-ink" : "bg-secondary text-slate-brand")
            }
          >
            <VitaIcon name={silenciada ? "volume-off" : "volume"} size={18} />
          </button>
          <button
            type="button"
            onClick={() => setHistorialAbierto(true)}
            className="flex size-9 items-center justify-center rounded-full bg-secondary text-slate-brand"
            aria-label="Historial de chats"
          >
            <VitaIcon name="clock" size={18} />
          </button>
          <button
            type="button"
            onClick={cerrarChat}
            className="flex size-9 items-center justify-center rounded-full bg-secondary text-slate-brand"
            aria-label="Cerrar chat"
          >
            <VitaIcon name="close" size={18} />
          </button>
        </div>

        {!esPropio && (
          <div className="bg-aviso-tint px-5 py-2 text-[12.5px] font-medium text-aviso-ink">
            Estás viendo a {nombreActivo}. vita responde sobre tu cuenta.
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {vacio && (
            <div className="flex justify-center pb-2 pt-2">
              <VitaAvatar size={170} estado={estadoAvatarHeader} activo={abierto} />
            </div>
          )}
          <div className="eyebrow pb-3.5 text-center text-subtle" suppressHydrationWarning>
            Hoy · {formatoFechaCorta(fechaDeHoyISO())}
          </div>
          {mensajes.map((m, i) => (
            <MensajeBurbuja key={i} m={m} cargando={enviando && i === mensajes.length - 1 && !m.content} alCerrar={cerrarChat} esPropio={esPropio} alReintentar={enviando ? undefined : reintentar} />
          ))}
          {vacio && (
            <div className="flex flex-wrap gap-1.5 pl-9 pt-1">
              {SUGERENCIAS_INICIALES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => enviar(s)}
                  disabled={agotado}
                  className="rounded-full bg-card px-3.5 py-2 text-[13px] font-bold text-teal-deep shadow-[inset_0_0_0_1px_var(--teal-100)] disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          <div ref={finRef} />
        </div>

        {uso && (
          <div className="px-5 pt-2">
            <BarraUso uso={uso} />
            <p
              className={
                "mt-1 text-center text-[11.5px] " +
                (barraUsoTono(uso) === "agotado"
                  ? "font-semibold text-destructive"
                  : barraUsoTono(uso) === "poco"
                    ? "text-chip-amber-ink"
                    : "text-muted-foreground")
              }
            >
              {textoRestante(uso)}
            </p>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            enviar(entrada);
          }}
          className="px-3.5 pb-[max(14px,env(safe-area-inset-bottom))] pt-2.5"
        >
          <div className="flex items-center gap-2 rounded-full bg-card py-1.5 pl-4 pr-1.5 shadow-float">
            <input
              value={entrada}
              onChange={(e) => alCambiarEntrada(e.target.value)}
              placeholder="Escribí algo…"
              disabled={enviando || agotado}
              className="min-w-0 flex-1 bg-transparent py-2 text-[15px] outline-none disabled:opacity-60"
            />
            <button
              type="button"
              onClick={alternarModoVoz}
              disabled={silenciada || (agotado && !modoVoz)}
              aria-pressed={modoVoz}
              aria-label={
                silenciada
                  ? "vita está silenciada"
                  : modoVoz
                    ? "Desactivar modo voz"
                    : "Activar modo voz (manos libres)"
              }
              title={silenciada ? "vita está silenciada" : undefined}
              className={
                "flex size-9 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-50 " +
                (modoVoz
                  ? "bg-primary text-primary-foreground " +
                    (estadoVoz === "grabando" || hablando ? "animate-pulse" : "")
                  : "bg-secondary text-slate-brand")
              }
            >
              <VitaIcon name="mic" size={18} />
            </button>
            <button
              type="submit"
              disabled={!entrada.trim() || enviando || agotado}
              aria-label="Enviar"
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors disabled:bg-secondary disabled:text-faint"
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
