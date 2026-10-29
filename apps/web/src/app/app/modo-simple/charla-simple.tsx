"use client";

import { useEffect, useRef, useState } from "react";
import { VitaIcon } from "@/lib/vita-icons";
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
  etiquetaMedicion,
  leerMedicionPropuesta,
  textoAyudaEnviada,
  textoPreguntaMedicion,
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

type Fase = "inicio" | "pensando" | "respuesta" | "confirmar";

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

export function CharlaSimple({
  nombre,
  config,
  medsHoy,
  turnoProximo,
  onCerrar,
}: {
  nombre: string;
  config: PrefsModoSimple;
  medsHoy: MedHoy[];
  turnoProximo: TurnoProximo | null;
  onCerrar: () => void;
}) {
  const enLinea = useEnLinea();
  const { silenciada } = useSilencioVita();

  const [fase, setFase] = useState<Fase>("inicio");
  const [pregunta, setPregunta] = useState("");
  const [respuesta, setRespuesta] = useState("");
  const [ayuda, setAyuda] = useState<string[] | null>(null);
  const [medicion, setMedicion] = useState<MedicionPropuesta | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [hablando, setHablando] = useState(false);
  const [mood, setMood] = useState<EstadoAvatar | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // Cada pregunta/respuesta nueva invalida a las anteriores: lo que llega tarde se descarta.
  const turnoRef = useRef(0);
  const sesionIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const blobRef = useRef<Blob | null>(null);
  const prefijoRef = useRef(false);
  const botonVolverRef = useRef<HTMLButtonElement>(null);

  // Foco al abrir (el botón Volver) y de vuelta al botón que abrió la vista al cerrar.
  useEffect(() => {
    const previo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    botonVolverRef.current?.focus();
    return () => {
      cancelarVoz();
      abortRef.current?.abort();
      if (previo?.isConnected) previo.focus();
    };
  }, []);

  const { estado: estadoVoz, iniciar, detener } = useGrabacionVoz({
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
    } finally {
      if (turno === turnoRef.current) setHablando(false);
    }
  }

  function mostrarRespuesta(preg: string, texto: string, extras?: { ayuda?: string[] | null; mood?: EstadoAvatar | null }) {
    setFase("respuesta");
    setPregunta(preg);
    setRespuesta(texto);
    setAyuda(extras?.ayuda ?? null);
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
    const turno = nuevoTurno();
    const prefijo = prefijoRef.current ? PREFIJO_ANIMO : "";
    prefijoRef.current = false;
    setAviso(null);
    setFase("pensando");
    setPregunta(texto);
    setAyuda(null);
    setMedicion(null);
    setMood(null);

    if (!enLinea) {
      mostrarRespuesta(texto, textoSinInternet(nombre));
      void hablar(textoSinInternet(nombre), turno);
      return;
    }

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const timeout = setTimeout(() => ctrl.abort(), TIMEOUT_PEDIDO_MS);
    let acumulado = "";
    let errorServidor: string | null = null;
    let nombresAyuda: string[] | null = null;
    let propuesta: MedicionPropuesta | null = null;
    let moodModelo: EstadoAvatar | null = null;
    try {
      const resp = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensaje: prefijo + texto, sesionId: sesionIdRef.current, modo: "simple" }),
        signal: ctrl.signal,
      });
      if (!resp.ok || !resp.body) {
        const cuerpo = (await resp.json().catch(() => null)) as { error?: unknown } | null;
        throw new ErrorMostrable(typeof cuerpo?.error === "string" && cuerpo.error ? cuerpo.error : TEXTO_NO_ENTENDI);
      }
      await leerEventosChat(resp.body, (e) => {
        if (e.tipo === "sesion") sesionIdRef.current = e.id;
        else if (e.tipo === "chunk") acumulado += e.texto;
        else if (e.tipo === "error") errorServidor = e.mensaje;
        else if (e.tipo === "accion") {
          if (e.accion.type === "ayuda_enviada" && Array.isArray(e.accion.nombres)) {
            const nombres = e.accion.nombres.filter((n): n is string => typeof n === "string" && n.trim() !== "");
            if (nombres.length) nombresAyuda = nombres;
          } else if (e.accion.type === "medicion_propuesta") {
            propuesta = leerMedicionPropuesta(e.accion) ?? propuesta;
          } else if (e.accion.type === "set_avatar_mood") {
            moodModelo = MOOD_A_ESTADO[String(e.accion.mood)] ?? null;
          }
        }
      });
    } catch (e) {
      if (!acumulado.trim() && !errorServidor) errorServidor = e instanceof ErrorMostrable ? e.message : TEXTO_NO_ENTENDI;
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
      setAyuda(null);
      void hablar(frase, turno);
      return;
    }
    const texto2 = acumulado.trim() || errorServidor || TEXTO_NO_ENTENDI;
    mostrarRespuesta(texto, texto2, { ayuda: nombresAyuda, mood: moodModelo });
    void hablar(texto2, turno);
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
      mostrarRespuesta("", saludo);
      void (async () => {
        await hablar(saludo, turno);
        if (turno !== turnoRef.current) return;
        await empezarAEscuchar();
      })();
    }
  }

  async function empezarAEscuchar() {
    const r = await iniciar();
    if (!r.ok) {
      setAviso(
        r.motivo === "permiso-denegado"
          ? "Necesito permiso para usar el micrófono. Podés tocar una pregunta."
          : "Este celular no deja usar el micrófono acá. Podés tocar una pregunta."
      );
    }
  }

  async function tocarMic() {
    desbloquearVoz();
    if (silenciada) return;
    if (estadoVoz !== "inactivo") {
      detener();
      return;
    }
    nuevoTurno();
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
    void reproducirBlob(blob, config.voz_lenta ? VELOCIDAD_VOZ_LENTA : 1).finally(() => {
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
    detener();
    onCerrar();
  }

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

  const textoAyuda = ayuda ? textoAyudaEnviada(ayuda) : "";
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
        onClick={cerrar}
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
            {textoAyuda && (
              <div className="flex items-center gap-3 rounded-[22px] border-2 border-primary/40 bg-persona-1-tint px-[18px] py-4 text-[20px] font-bold text-foreground">
                <VitaIcon name="check" size={26} strokeWidth={3} className="shrink-0 text-teal-deep" />
                {textoAyuda}
              </div>
            )}
            {aviso && (
              <p role="status" className="text-[18px] font-semibold text-slate-brand">
                {aviso}
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-col gap-2.5">
            {!silenciada && config.voz && (
              <button type="button" onClick={escucharDeNuevo} className={cn(clasesBoton, "h-14 border-2 border-foreground/15 bg-card")}>
                <VitaIcon name="volume" size={24} strokeWidth={2.2} />
                Escuchar de nuevo
              </button>
            )}
            <button
              type="button"
              onClick={tocarMic}
              disabled={silenciada}
              className={cn(
                clasesBoton,
                "h-[66px] bg-primary text-[19px] font-extrabold text-primary-foreground shadow-[0_8px_20px_color-mix(in_srgb,var(--primary)_28%,transparent)]"
              )}
            >
              <VitaIcon name="mic" size={26} strokeWidth={2.4} />
              Preguntar otra cosa
            </button>
            {silenciada && <p className="text-center text-[16px] font-semibold text-slate-brand">El sonido está desactivado. Podés tocar una pregunta.</p>}
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto pt-6">
          <VitaAvatar size={104} estado={estadoAvatar} interactivo={false} />
          <h1 className="mt-4 font-heading text-[32px] font-extrabold tracking-[-0.03em]">¿En qué te ayudo?</h1>
          <p className="mt-1.5 text-center text-[20px] font-medium text-slate-brand">Hablame, o tocá una pregunta.</p>
          {!enLinea && (
            <div role="status" className="mt-4 self-stretch rounded-[20px] bg-foreground px-4 py-3.5 text-center text-[18px] font-bold leading-[1.35] text-primary-foreground">
              Sin internet. Te respondo sobre tus pastillas y turnos.
            </div>
          )}
          <div className="mt-5 flex flex-col gap-2.5 self-stretch">
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
          <button
            type="button"
            onClick={tocarMic}
            disabled={silenciada}
            aria-label="Tocá y hablá"
            className="flex flex-col items-center gap-2.5 disabled:opacity-50"
          >
            <span className="flex size-[92px] items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_10px_26px_color-mix(in_srgb,var(--primary)_35%,transparent)]">
              <VitaIcon name="mic" size={46} strokeWidth={2.2} />
            </span>
            <span className="text-[20px] font-extrabold">{silenciada ? "El sonido está desactivado" : "Tocá y hablá"}</span>
          </button>
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
  onSi,
  onNo,
}: {
  pregunta: string;
  medicion: MedicionPropuesta;
  estado: EstadoAvatar;
  guardando: boolean;
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
