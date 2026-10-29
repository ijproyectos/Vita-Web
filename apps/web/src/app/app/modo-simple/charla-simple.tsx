"use client";

import { useEffect, useRef, useState } from "react";
import { VitaIcon } from "@/lib/vita-icons";
import { BotonAyuda } from "@/components/vita/modo-simple/piezas";
import { VitaAvatar } from "@/components/vita/v-mark";
import type { EstadoAvatar } from "@/components/vita/estados-avatar";
import { cn } from "@/lib/utils";
import { leerEventosChat } from "@/lib/chat/leer-sse";
import { fechaISOEnAR } from "@/lib/rutina/formato";
import { useEnLinea } from "@/lib/red/usar-en-linea";
import { cancelarVoz, desbloquearVoz, obtenerAudioBlob, reproducirBlob } from "@/lib/voz/hablar-cliente";
import { useGrabacionVoz } from "@/lib/voz/usar-grabacion-voz";
import { useSilencioVita } from "@/lib/voz/usar-silencio";
import { guardarMedicionSimpleAction } from "@/lib/modo-simple/actions";
import { horaActualEnAR } from "@/lib/modo-simple/formato";
import { respuestaProximoTurno, respuestaQueMeToca, respuestaYaTome, type MedHoy, type TurnoProximo } from "@/lib/modo-simple/respuestas";
import { VELOCIDAD_VOZ_LENTA, type PrefsModoSimple } from "@/lib/modo-simple/tipos";
import {
  PREFIJO_ANIMO,
  TEXTO_MEDICION_NO,
  TEXTO_MEDICION_OK,
  TEXTO_NO_ENTENDI,
  TEXTO_SIN_CONEXION_PEDIDO,
  textoRespuestaFinal,
  etiquetaMedicion,
  leerMedicionPropuesta,
  textoPreguntaMedicion,
  destinoTrasIniciar,
  escuchaTrabada,
  textoParaEnviar,
  textoSinMic,
  ESPERA_SIN_OIR_MS,
  LARGO_MAXIMO_MENSAJE,
  TEXTO_TOCA_EL_MIC,
  textoSaludoAnimo,
  textoSinInternet,
  type MedicionPropuesta,
} from "@/lib/modo-simple/charla";

// Pantalla de voz del modo simple (V7 "isVoice"): reemplaza al chat normal para la persona mayor.
// Capas: las 3 preguntas de los chips se contestan LOCAL (sin red); lo demás va a /api/chat con
// modo "simple". `pantalla.tsx` es la dueña: monta/desmonta esta vista, y al desmontar se corta
// todo (audio, micrófono, pedido en curso).

// Tope total de un pedido al chat: nunca queda "Pensando…" colgado.
const TIMEOUT_PEDIDO_MS = 20_000;

type Fase = "inicio" | "escribir" | "pensando" | "respuesta" | "confirmar";

/** Solo para la vista previa de desarrollo (`/dev/charla-simple`): abre la charla ya en un estado dado. */
export type VistaInicialCharla = {
  fase: "inicio" | "escribir" | "respuesta" | "confirmar";
  pregunta?: string;
  respuesta?: string;
  /** Show the red "Llamar a mi familia" button (vita suggested calling; nothing was sent to anyone). */
  ayudaLlamar?: boolean;
  medicion?: MedicionPropuesta;
  sinInternet?: boolean;
};

const MOOD_A_ESTADO: Record<string, EstadoAvatar> = {
  neutral: "idle",
  happy: "happy",
  empathetic: "empathetic",
  calm: "calm",
  alert: "alert",
};

type Chip = { id: "animo" | "turno" | "tome" | "toca"; label: string };

class ErrorMostrable extends Error {}

const clasesBoton =
  "flex items-center justify-center gap-2.5 rounded-[22px] text-[18px] font-bold transition-transform active:scale-[0.98] motion-reduce:transition-none disabled:opacity-60";

// Wrapped so the purity lint does not read a clock call inside an event handler as render-time impurity.
function ahoraMs() {
  return Date.now();
}

export function CharlaSimple({
  nombre,
  config,
  medsHoy,
  turnoProximo,
  onCerrar,
  telefonoAyuda,
  nombreAyuda,
  onAyudaSinContacto,
  inicial,
}: {
  nombre: string;
  config: PrefsModoSimple;
  medsHoy: MedHoy[];
  turnoProximo: TurnoProximo | null;
  onCerrar: () => void;
  /** Same emergency contact the red Ayuda button of the home screen calls. */
  telefonoAyuda: string | null;
  nombreAyuda: string | null;
  /** Opens the sheet that explains where to set the contact (no phone). */
  onAyudaSinContacto: () => void;
  inicial?: VistaInicialCharla;
}) {
  const enLinea = useEnLinea() && !inicial?.sinInternet;
  const { silenciada } = useSilencioVita();

  const [fase, setFase] = useState<Fase>(inicial?.fase ?? "inicio");
  const [pregunta, setPregunta] = useState(inicial?.pregunta ?? "");
  const [respuesta, setRespuesta] = useState(inicial?.respuesta ?? "");
  const [ayudaLlamar, setAyudaLlamar] = useState(inicial?.ayudaLlamar ?? false);
  const [medicion, setMedicion] = useState<MedicionPropuesta | null>(inicial?.medicion ?? null);
  const [borrador, setBorrador] = useState("");
  const [resaltarMic, setResaltarMic] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [hablando, setHablando] = useState(false);
  const [mood, setMood] = useState<EstadoAvatar | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // Cada pregunta/respuesta nueva invalida a las anteriores: lo que llega tarde se descarta.
  const turnoRef = useRef(0);
  const sesionIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inicioEscuchaRef = useRef(0);
  const blobRef = useRef<Blob | null>(null);
  const prefijoRef = useRef(false);
  const botonVolverRef = useRef<HTMLButtonElement>(null);
  const campoRef = useRef<HTMLTextAreaElement>(null);
  const vigiaRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Foco al abrir (el botón Volver) y de vuelta al botón que abrió la vista al cerrar.
  useEffect(() => {
    const previo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    botonVolverRef.current?.focus();
    const turnos = turnoRef;
    const vigia = vigiaRef;
    return () => {
      if (vigia.current) clearTimeout(vigia.current);
      // Invalida el turno en curso: un audio que todavía se está pidiendo no suena después de cerrar.
      turnos.current += 1;
      cancelarVoz();
      abortRef.current?.abort();
      if (previo?.isConnected) previo.focus();
    };
  }, []);

  const { estado: estadoVoz, iniciar, detener, preparar, contextoSuspendido, obtenerEstado } = useGrabacionVoz({
    onTranscripcion: (texto) => {
      detener();
      const limpio = texto.trim();
      if (limpio) void preguntar(limpio);
      else mostrarRespuesta("", TEXTO_NO_ENTENDI);
    },
    onError: (mensaje) => {
      detener();
      setAviso(mensaje);
    },
  });
  const escuchando = estadoVoz === "escuchando" || estadoVoz === "grabando";
  const transcribiendo = estadoVoz === "procesando";

  function nuevoTurno(): number {
    turnoRef.current += 1;
    if (vigiaRef.current) clearTimeout(vigiaRef.current);
    setResaltarMic(false);
    prefijoRef.current = false; // solo la primera respuesta a "¿Cómo estás hoy?" lleva el prefijo
    abortRef.current?.abort();
    cancelarVoz();
    setHablando(false);
    return turnoRef.current;
  }

  async function hablar(texto: string, turno: number) {
    blobRef.current = null;
    if (silenciada || !config.voz || !texto.trim()) return;
    setHablando(true);
    try {
      const blob = await obtenerAudioBlob(texto);
      if (turno !== turnoRef.current) return;
      blobRef.current = blob;
      await reproducirBlob(blob, config.voz_lenta ? VELOCIDAD_VOZ_LENTA : 1);
    } catch {
      // Sin voz igual queda el texto en pantalla; nunca cortar el flujo (p. ej. abrir el micrófono).
    } finally {
      if (turno === turnoRef.current) setHablando(false);
    }
  }

  function mostrarRespuesta(preg: string, texto: string, extras?: { ayudaLlamar?: boolean; mood?: EstadoAvatar | null }) {
    setFase("respuesta");
    setPregunta(preg);
    setRespuesta(texto);
    setAyudaLlamar(extras?.ayudaLlamar ?? false);
    setMedicion(null);
    setMood(extras?.mood ?? null);
  }

  function responderLocal(preg: string, texto: string) {
    const turno = nuevoTurno();
    detener();
    setAviso(null);
    mostrarRespuesta(preg, texto);
    void hablar(texto, turno);
  }

  async function preguntar(texto: string) {
    const prefijo = prefijoRef.current ? PREFIJO_ANIMO : "";
    const turno = nuevoTurno();
    setAviso(null);
    setFase("pensando");
    setPregunta(texto);
    setAyudaLlamar(false);
    setMedicion(null);
    setMood(null);

    if (!enLinea) {
      // Without internet vita can't tell whether this is a help request, so the call button always shows
      // (calm, no pulse): a `tel:` call goes over the phone line and still works offline.
      mostrarRespuesta(texto, textoSinInternet(nombre), { ayudaLlamar: true });
      void hablar(textoSinInternet(nombre), turno);
      return;
    }

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const timeout = setTimeout(() => ctrl.abort(), TIMEOUT_PEDIDO_MS);
    let acumulado = "";
    let errorServidor: string | null = null;
    let llamarAyuda = false;
    let propuesta: MedicionPropuesta | null = null;
    let moodModelo: EstadoAvatar | null = null;
    let cortada = false;
    try {
      const resp = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensaje: prefijo + texto, sesionId: sesionIdRef.current, modo: "simple" }),
        signal: ctrl.signal,
      });
      if (!resp.ok || !resp.body) {
        const cuerpo = (await resp.json().catch(() => null)) as { error?: unknown } | null;
        throw new ErrorMostrable(typeof cuerpo?.error === "string" && cuerpo.error ? cuerpo.error : TEXTO_SIN_CONEXION_PEDIDO);
      }
      const { terminoBien } = await leerEventosChat(resp.body, (e) => {
        if (e.tipo === "sesion") sesionIdRef.current = e.id;
        else if (e.tipo === "chunk") acumulado += e.texto;
        else if (e.tipo === "error") errorServidor = e.mensaje;
        else if (e.tipo === "accion") {
          if (e.accion.type === "ayuda_llamar") {
            llamarAyuda = true;
          } else if (e.accion.type === "medicion_propuesta") {
            propuesta = leerMedicionPropuesta(e.accion) ?? propuesta;
          } else if (e.accion.type === "avatar_mood") {
            moodModelo = MOOD_A_ESTADO[String(e.accion.mood)] ?? null;
          }
        }
      });
      cortada = !terminoBien;
    } catch (e) {
      cortada = true;
      if (!acumulado.trim() && !errorServidor) errorServidor = e instanceof ErrorMostrable ? e.message : TEXTO_SIN_CONEXION_PEDIDO;
    } finally {
      clearTimeout(timeout);
    }
    if (turno !== turnoRef.current) return;

    const propuestaFinal = propuesta as MedicionPropuesta | null;
    if (propuestaFinal) {
      const frase = textoPreguntaMedicion(propuestaFinal);
      setFase("confirmar");
      setMedicion(propuestaFinal);
      setRespuesta(frase);
      setAyudaLlamar(llamarAyuda); // if help was also suggested this turn, the call button stays visible
      void hablar(frase, turno);
      return;
    }
    const textoFinal = textoRespuestaFinal(acumulado, cortada, errorServidor);
    mostrarRespuesta(texto, textoFinal, { ayudaLlamar: llamarAyuda, mood: moodModelo });
    void hablar(textoFinal, turno);
  }

  function alTocarChip(chip: Chip) {
    desbloquearVoz();
    if (chip.id === "turno") responderLocal(chip.label, respuestaProximoTurno(turnoProximo, fechaISOEnAR()));
    else if (chip.id === "tome") responderLocal(chip.label, respuestaYaTome(medsHoy, horaActualEnAR()));
    else if (chip.id === "toca") responderLocal(chip.label, respuestaQueMeToca(medsHoy));
    else {
      // vita pregunta cómo está y, cuando termina de hablar, escucha la respuesta.
      const turno = nuevoTurno();
      detener();
      setAviso(null);
      prefijoRef.current = true;
      const saludo = textoSaludoAnimo(nombre);
      if (silenciada) {
        // Sin sonido: el saludo se muestra y se pasa a escribir (nada de TTS ni micrófono).
        mostrarRespuesta("", saludo);
        setAviso(saludo);
        setFase("escribir");
        return;
      }
      // Dentro del gesto del tap: desbloquea el AudioContext (iOS). El micrófono recién se abre
      // cuando vita termina de hablar, así nunca graba su propia voz.
      preparar();
      mostrarRespuesta("", saludo);
      void (async () => {
        await hablar(saludo, turno);
        if (turno !== turnoRef.current) return;
        await empezarAEscuchar();
      })();
    }
  }

  async function empezarAEscuchar() {
    const turno = turnoRef.current;
    const r = await iniciar();
    if (turno !== turnoRef.current) return;
    const destino = destinoTrasIniciar(r);
    if (!r.ok) {
      setAviso(textoSinMic(r.motivo));
      setFase("escribir");
    } else if (destino === "tocar-mic") {
      avisarTocarMic();
    } else {
      // Red de seguridad: si el contexto sigue suspendido y no se oyó nada, no queda colgado en "Te escucho…".
      if (vigiaRef.current) clearTimeout(vigiaRef.current);
      inicioEscuchaRef.current = ahoraMs();
      vigiaRef.current = setTimeout(() => {
        const esperadoMs = ahoraMs() - inicioEscuchaRef.current;
        if (turno === turnoRef.current && escuchaTrabada(obtenerEstado(), contextoSuspendido(), esperadoMs)) avisarTocarMic();
      }, ESPERA_SIN_OIR_MS);
    }
  }

  function avisarTocarMic() {
    detener();
    setAviso(TEXTO_TOCA_EL_MIC);
    setResaltarMic(true);
  }

  function irAEscribir() {
    nuevoTurno();
    detener();
    setAviso(null);
    setFase("escribir");
  }

  function enviarBorrador() {
    const texto = textoParaEnviar(borrador);
    if (!texto) return;
    setBorrador("");
    void preguntar(texto);
  }

  function volver() {
    if (fase === "escribir") {
      setAviso(null);
      setFase("inicio");
    } else cerrar();
  }

  async function tocarMic() {
    desbloquearVoz();
    if (silenciada) return;
    if (estadoVoz !== "inactivo") {
      detener();
      return;
    }
    // `nuevoTurno` apaga el resaltado y el prefijo; si se tocó el mic que pedía el saludo, sigue siendo esa respuesta.
    const eraRespuestaAlSaludo = prefijoRef.current && resaltarMic;
    nuevoTurno();
    prefijoRef.current = eraRespuestaAlSaludo;
    setAviso(null);
    await empezarAEscuchar();
  }

  function escucharDeNuevo() {
    desbloquearVoz();
    const turno = nuevoTurno();
    const blob = blobRef.current;
    if (!blob) {
      void hablar(respuesta, turno);
      return;
    }
    setHablando(true);
    void reproducirBlob(blob, config.voz_lenta ? VELOCIDAD_VOZ_LENTA : 1).catch(() => {}).finally(() => {
      if (turno === turnoRef.current) setHablando(false);
    });
  }

  async function confirmarMedicion() {
    if (!medicion || guardando) return;
    const turno = nuevoTurno();
    setGuardando(true);
    let texto = TEXTO_MEDICION_OK;
    try {
      const r = await guardarMedicionSimpleAction({
        tipo: medicion.tipo,
        valor: medicion.valor,
        valorSecundario: medicion.valorSecundario,
      });
      if (r.status === "error") texto = r.message;
    } catch {
      texto = "No pude anotarlo. Probá de nuevo.";
    }
    setGuardando(false);
    if (turno !== turnoRef.current) return;
    mostrarRespuesta(pregunta, texto);
    void hablar(texto, turno);
  }

  function rechazarMedicion() {
    desbloquearVoz();
    const turno = nuevoTurno();
    mostrarRespuesta(pregunta, TEXTO_MEDICION_NO);
    void hablar(TEXTO_MEDICION_NO, turno);
  }

  function cerrar() {
    turnoRef.current += 1;
    prefijoRef.current = false;
    detener();
    onCerrar();
  }

  useEffect(() => {
    if (fase === "escribir") campoRef.current?.focus();
  }, [fase]);

  useEffect(() => {
    function alTeclado(e: KeyboardEvent) {
      if (e.key === "Escape") cerrar();
    }
    window.addEventListener("keydown", alTeclado);
    return () => window.removeEventListener("keydown", alTeclado);
    // `cerrar` solo usa refs y callbacks estables del hook: se registra una vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chips: Chip[] = [
    ...(!silenciada ? [{ id: "animo", label: "¿Cómo estás hoy?" } as Chip] : []),
    ...(config.ver_turnos ? [{ id: "turno", label: "¿Cuándo es mi próximo turno?" } as Chip] : []),
    { id: "tome", label: "¿Ya tomé la pastilla?" },
    { id: "toca", label: "¿Qué pastillas me tocan hoy?" },
  ];

  const estadoAvatar: EstadoAvatar = hablando
    ? "speaking"
    : escuchando
      ? "listening"
      : transcribiendo || fase === "pensando"
        ? "thinking"
        : (mood ?? (fase === "respuesta" ? "calm" : "idle"));

  const verEscucha = escuchando || transcribiendo;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Hablar con vita"
      className="absolute inset-0 z-40 flex flex-col bg-cream px-[18px] pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))]"
    >
      <button
        ref={botonVolverRef}
        type="button"
        onClick={volver}
        className="flex h-14 shrink-0 items-center gap-2 self-start rounded-full border-2 border-foreground/10 bg-card pl-3.5 pr-5 text-[17px] font-extrabold transition-transform active:scale-[0.97] motion-reduce:transition-none"
      >
        <VitaIcon name="chevron-left" size={22} strokeWidth={2.6} />
        Volver
      </button>

      {verEscucha ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
          <div className="relative flex size-[150px] items-center justify-center">
            <span aria-hidden className="absolute inset-0 animate-pulse rounded-full bg-persona-1-tint motion-reduce:animate-none" />
            <VitaAvatar size={120} estado={estadoAvatar} interactivo={false} />
          </div>
          <div role="status" className="text-[22px] font-bold text-teal-deep">
            {transcribiendo ? "Un momento…" : "Te escucho…"}
          </div>
          {pregunta && fase === "pensando" && <Dicho texto={pregunta} />}
          <button type="button" onClick={tocarMic} className={cn(clasesBoton, "h-14 border-2 border-foreground/15 bg-card px-7")}>
            <VitaIcon name="close" size={22} />
            Dejar de escuchar
          </button>
        </div>
      ) : fase === "escribir" ? (
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pt-6">
          <h1 className="font-heading text-[28px] font-extrabold leading-[1.2] tracking-[-0.03em]">Escribime lo que necesites</h1>
          {aviso && (
            <p role="status" className="text-[20px] font-medium leading-[1.4] text-slate-brand">
              {aviso}
            </p>
          )}
          <textarea
            ref={campoRef}
            value={borrador}
            onChange={(e) => setBorrador(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                enviarBorrador();
              }
            }}
            maxLength={LARGO_MAXIMO_MENSAJE}
            enterKeyHint="send"
            aria-label="Escribime lo que necesites"
            placeholder="Por ejemplo: ¿qué tomo a la noche?"
            className="min-h-[140px] resize-none rounded-[22px] border-2 border-primary bg-card px-[18px] py-4 text-[22px] font-semibold leading-[1.35] outline-none"
          />
          <div className="min-h-2 flex-1" />
          <button
            type="button"
            onClick={enviarBorrador}
            disabled={!borrador.trim()}
            className={cn(clasesBoton, "h-[66px] shrink-0 text-[20px] font-extrabold", borrador.trim() ? "bg-primary text-primary-foreground" : "bg-secondary text-slate-brand")}
          >
            <VitaIcon name="send" size={24} strokeWidth={2.4} />
            Preguntarle a vita
          </button>
        </div>
      ) : fase === "pensando" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
          <VitaAvatar size={150} estado={estadoAvatar} interactivo={false} />
          <div role="status" className="text-[22px] font-bold text-teal-deep">
            Pensando…
          </div>
          <Dicho texto={pregunta} />
        </div>
      ) : fase === "confirmar" && medicion ? (
        <VistaConfirmar
          pregunta={pregunta}
          medicion={medicion}
          estado={estadoAvatar}
          guardando={guardando}
          ayudaLlamar={ayudaLlamar}
          telefonoAyuda={telefonoAyuda}
          nombreAyuda={nombreAyuda}
          onAyudaSinContacto={onAyudaSinContacto}
          onSi={confirmarMedicion}
          onNo={rechazarMedicion}
        />
      ) : fase === "respuesta" ? (
        <div className="flex min-h-0 flex-1 flex-col gap-[18px] pt-6">
          <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto">
            {pregunta && (
              <div className="max-w-[86%] self-end rounded-[22px_22px_6px_22px] bg-secondary px-[18px] py-3.5 text-[20px] font-semibold leading-[1.35]">
                {pregunta}
              </div>
            )}
            <div className="flex items-start gap-3">
              <div className="shrink-0">
                <VitaAvatar size={52} estado={estadoAvatar} interactivo={false} />
              </div>
              <div aria-live="polite" className="min-w-0 flex-1 text-pretty text-[28px] font-extrabold leading-[1.3] tracking-[-0.01em]">
                {respuesta}
              </div>
            </div>
            {ayudaLlamar && (
              <BotonAyuda
                telefono={telefonoAyuda}
                contacto={nombreAyuda}
                onAyuda={onAyudaSinContacto}
                etiqueta="Llamar a mi familia"
                className={cn("h-[66px] w-full justify-center text-[21px]", enLinea && "animate-pulse motion-reduce:animate-none")}
              />
            )}
          </div>
          <div className="flex shrink-0 flex-col gap-2.5">
            {!silenciada && config.voz && (
              <button type="button" onClick={escucharDeNuevo} className={cn(clasesBoton, "h-14 border-2 border-foreground/15 bg-card")}>
                <VitaIcon name="volume" size={24} strokeWidth={2.2} />
                Escuchar de nuevo
              </button>
            )}
            {aviso && (
              <p role="status" className="text-center text-[18px] font-bold text-teal-deep">
                {aviso}
              </p>
            )}
            <button
              type="button"
              onClick={silenciada ? irAEscribir : tocarMic}
              className={cn(
                clasesBoton,
                "h-[66px] bg-primary text-[19px] font-extrabold text-primary-foreground shadow-[0_8px_20px_color-mix(in_srgb,var(--primary)_28%,transparent)]",
                resaltarMic && "animate-pulse ring-4 ring-primary/40 motion-reduce:animate-none"
              )}
            >
              <VitaIcon name={silenciada ? "edit" : "mic"} size={26} strokeWidth={2.4} />
              {silenciada ? "Escribir otra cosa" : "Preguntar otra cosa"}
            </button>
            {silenciada && <p className="text-center text-[16px] font-semibold text-slate-brand">El sonido está desactivado.</p>}
          </div>
        </div>
      ) : (
        // Offline, the banner takes the subtitle's place and the header shrinks, so the mic
        // and "Prefiero escribir" still fit on a ~844px-tall phone without scrolling.
        <div className={cn("flex min-h-0 flex-1 flex-col items-center overflow-y-auto", enLinea ? "pt-6" : "pt-3")}>
          <VitaAvatar size={enLinea ? 104 : 72} estado={estadoAvatar} interactivo={false} />
          <h1 className={cn("font-heading text-[32px] font-extrabold tracking-[-0.03em]", enLinea ? "mt-4" : "mt-2")}>¿En qué te ayudo?</h1>
          {enLinea ? (
            <p className="mt-1.5 text-center text-[20px] font-medium text-slate-brand">Hablame, o tocá una pregunta.</p>
          ) : (
            <div role="status" className="mt-3 self-stretch rounded-[20px] bg-foreground px-4 py-3 text-center text-[18px] font-bold leading-[1.3] text-primary-foreground">
              Sin internet. Te respondo sobre tus pastillas y turnos.
            </div>
          )}
          <div className={cn("flex flex-col gap-2.5 self-stretch", enLinea ? "mt-5" : "mt-4")}>
            {chips.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => alTocarChip(c)}
                className="flex min-h-[58px] items-center rounded-[22px] border-2 border-foreground/10 bg-card px-5 py-3 text-left text-[18px] font-bold leading-[1.25] active:bg-secondary"
              >
                {c.label}
              </button>
            ))}
          </div>
          <div className="min-h-6 flex-1" />
          {aviso && (
            <p role="status" className="mb-3 text-center text-[18px] font-semibold text-slate-brand">
              {aviso}
            </p>
          )}
          {silenciada ? (
            <button type="button" onClick={irAEscribir} className={cn(clasesBoton, "h-[72px] self-stretch bg-primary text-[20px] font-extrabold text-primary-foreground")}>
              <VitaIcon name="edit" size={26} strokeWidth={2.4} />
              Escribirle a vita
            </button>
          ) : (
            <>
              <button type="button" onClick={tocarMic} aria-label="Tocá y hablá" className="flex flex-col items-center gap-2.5">
                <span
                  className={cn(
                    "flex size-[92px] items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_10px_26px_color-mix(in_srgb,var(--primary)_35%,transparent)]",
                    resaltarMic && "animate-pulse ring-4 ring-primary/40 motion-reduce:animate-none"
                  )}
                >
                  <VitaIcon name="mic" size={46} strokeWidth={2.2} />
                </span>
                <span className="text-[20px] font-extrabold">Tocá y hablá</span>
              </button>
              <button type="button" onClick={irAEscribir} className="mt-2 flex h-14 items-center gap-2 px-5 text-[18px] font-bold text-teal-deep underline underline-offset-4">
                <VitaIcon name="edit" size={22} />
                Prefiero escribir
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Dicho({ texto }: { texto: string }) {
  return <div className="text-balance text-[28px] font-extrabold leading-[1.25] tracking-[-0.02em]">“{texto}”</div>;
}

function VistaConfirmar({
  pregunta,
  medicion,
  estado,
  guardando,
  ayudaLlamar,
  telefonoAyuda,
  nombreAyuda,
  onAyudaSinContacto,
  onSi,
  onNo,
}: {
  pregunta: string;
  medicion: MedicionPropuesta;
  estado: EstadoAvatar;
  guardando: boolean;
  ayudaLlamar: boolean;
  telefonoAyuda: string | null;
  nombreAyuda: string | null;
  onAyudaSinContacto: () => void;
  onSi: () => void;
  onNo: () => void;
}) {
  const { etiqueta, valor, unidad } = etiquetaMedicion(medicion);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[18px] pt-6">
      {pregunta && (
        <div className="max-w-[86%] self-end rounded-[22px_22px_6px_22px] bg-secondary px-[18px] py-3.5 text-[20px] font-semibold leading-[1.35]">
          {pregunta}
        </div>
      )}
      <div className="flex items-center gap-3">
        <VitaAvatar size={52} estado={estado} interactivo={false} />
        <div aria-live="polite" className="text-[25px] font-bold leading-[1.3]">
          ¿Lo anoto así?
        </div>
      </div>
      <div className="flex flex-col items-center gap-1.5 rounded-[28px] border-2 border-primary bg-card px-5 py-6 text-center">
        <div className="text-[22px] font-extrabold text-teal-deep">{etiqueta}</div>
        <div className="font-heading text-[72px] font-extrabold leading-none tracking-[-0.04em] tabular-nums">{valor}</div>
        <div className="text-[20px] font-bold text-slate-brand">{unidad}</div>
      </div>
      {ayudaLlamar && (
        <BotonAyuda
          telefono={telefonoAyuda}
          contacto={nombreAyuda}
          onAyuda={onAyudaSinContacto}
          etiqueta="Llamar a mi familia"
          className="h-[66px] w-full justify-center text-[21px] animate-pulse motion-reduce:animate-none"
        />
      )}
      <div className="flex-1" />
      <div className="flex flex-col gap-2.5">
        <button
          type="button"
          onClick={onSi}
          disabled={guardando}
          className={cn(
            clasesBoton,
            "h-[72px] rounded-[24px] bg-teal-deep text-[21px] font-extrabold text-primary-foreground shadow-[0_8px_20px_color-mix(in_srgb,var(--teal-deep)_28%,transparent)]"
          )}
        >
          <VitaIcon name="check" size={30} strokeWidth={3} />
          Sí, anotalo
        </button>
        <button type="button" onClick={onNo} disabled={guardando} className={cn(clasesBoton, "h-14 border-2 border-foreground/15 bg-card")}>
          No
        </button>
      </div>
    </div>
  );
}
