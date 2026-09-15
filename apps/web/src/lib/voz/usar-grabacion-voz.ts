"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EstadoVoz } from "./tipos";

// VAD por umbral de amplitud simple (RMS de la señal en el dominio del
// tiempo) — no hace falta nada más sofisticado para detectar "el usuario
// dejó de hablar" en un chat de salud, un modelo de VAD dedicado sería
// sobre-ingeniería acá.
const UMBRAL_VOLUMEN = 0.02;
const SILENCIO_MS = 800; // debounce: cuánto silencio antes de cerrar el turno
const DURACION_MINIMA_MS = 300; // segmentos más cortos se descartan como ruido

export type MotivoNoIniciado = "no-soportado" | "permiso-denegado";
export type ResultadoInicioVoz = { ok: true } | { ok: false; motivo: MotivoNoIniciado };

function elegirMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return undefined;
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((tipo) => MediaRecorder.isTypeSupported(tipo));
}

function extensionDe(mimeType: string): string {
  if (mimeType.includes("mp4")) return "mp4";
  return "webm";
}

/**
 * Hook de grabación por voz para el modo manos-libres del chat con vita:
 * detecta actividad de voz (VAD por amplitud), graba cada turno con
 * MediaRecorder, lo manda a transcribir y avisa por onTranscripcion.
 *
 * No decide cuándo retomar la escucha después de una transcripción
 * exitosa — eso queda a cargo de quien llama (necesita esperar a que vita
 * responda y termine de hablar por TTS antes del próximo turno). Llamar a
 * reanudarEscucha() cuando corresponda. En error de transcripción, en
 * cambio, el hook retoma solo (no hay nada más que esperar).
 */
export function useGrabacionVoz({
  onTranscripcion,
  onError,
}: {
  onTranscripcion: (texto: string) => void;
  onError?: (mensaje: string) => void;
}) {
  const [estado, setEstado] = useState<EstadoVoz>("inactivo");
  const estadoRef = useRef<EstadoVoz>("inactivo");
  const activoRef = useRef(false);

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const grabandoRef = useRef(false);
  const inicioSegmentoRef = useRef(0);
  const silencioTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);

  const onTranscripcionRef = useRef(onTranscripcion);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onTranscripcionRef.current = onTranscripcion;
  }, [onTranscripcion]);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const actualizarEstado = useCallback((nuevo: EstadoVoz) => {
    estadoRef.current = nuevo;
    setEstado(nuevo);
  }, []);

  const detener = useCallback(() => {
    activoRef.current = false;

    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (silencioTimeoutRef.current) {
      clearTimeout(silencioTimeoutRef.current);
      silencioTimeoutRef.current = null;
    }

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      // Se corta el modo voz a mano (o se desmonta) — se descarta el
      // segmento en curso, no tiene sentido transcribir un turno truncado
      // a propósito por el usuario.
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.stop();
    }
    mediaRecorderRef.current = null;
    grabandoRef.current = false;
    chunksRef.current = [];

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close().catch(() => {});
    }
    audioContextRef.current = null;
    analyserRef.current = null;

    actualizarEstado("inactivo");
  }, [actualizarEstado]);

  const manejarFinSegmento = useCallback(
    async (mimeType: string) => {
      const duracion = Date.now() - inicioSegmentoRef.current;
      const blob = new Blob(chunksRef.current, { type: mimeType });
      chunksRef.current = [];

      if (duracion < DURACION_MINIMA_MS || blob.size === 0) {
        // Probablemente ruido, no una intervención real — se descarta sin
        // gastar una llamada de transcripción.
        if (activoRef.current) actualizarEstado("escuchando");
        return;
      }

      actualizarEstado("procesando");

      try {
        const formData = new FormData();
        formData.append("audio", blob, `turno.${extensionDe(mimeType)}`);
        const respuesta = await fetch("/api/voz/transcribir", { method: "POST", body: formData });
        const datos = (await respuesta.json().catch(() => null)) as { texto?: string; error?: string } | null;

        if (!respuesta.ok || !datos?.texto) {
          onErrorRef.current?.(datos?.error ?? "No se pudo transcribir el audio.");
          if (activoRef.current) actualizarEstado("escuchando");
          return;
        }

        onTranscripcionRef.current(datos.texto);
        // No se retoma la escucha acá — el llamador maneja enviar()/TTS y
        // llama a reanudarEscucha() cuando el turno completo terminó.
      } catch {
        onErrorRef.current?.("No se pudo conectar con el servicio de transcripción.");
        if (activoRef.current) actualizarEstado("escuchando");
      }
    },
    [actualizarEstado]
  );

  const empezarSegmento = useCallback(() => {
    if (!streamRef.current) return;
    const mimeType = elegirMimeType();
    const recorder = new MediaRecorder(streamRef.current, mimeType ? { mimeType } : undefined);
    const tipoEfectivo = mimeType ?? recorder.mimeType ?? "audio/webm";

    chunksRef.current = [];
    recorder.ondataavailable = (evento) => {
      if (evento.data.size > 0) chunksRef.current.push(evento.data);
    };
    recorder.onstop = () => {
      void manejarFinSegmento(tipoEfectivo);
    };

    recorder.start();
    mediaRecorderRef.current = recorder;
    grabandoRef.current = true;
    inicioSegmentoRef.current = Date.now();
    actualizarEstado("grabando");
  }, [actualizarEstado, manejarFinSegmento]);

  const detenerSegmento = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    grabandoRef.current = false;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  }, []);

  const monitorear = useCallback(() => {
    const datos = new Uint8Array(analyserRef.current?.fftSize ?? 2048);

    const paso = () => {
      const analyser = analyserRef.current;
      if (!activoRef.current || !analyser) return;

      analyser.getByteTimeDomainData(datos);
      let sumaCuadrados = 0;
      for (let i = 0; i < datos.length; i++) {
        const normalizado = (datos[i] - 128) / 128;
        sumaCuadrados += normalizado * normalizado;
      }
      const rms = Math.sqrt(sumaCuadrados / datos.length);

      if (rms > UMBRAL_VOLUMEN) {
        if (silencioTimeoutRef.current) {
          clearTimeout(silencioTimeoutRef.current);
          silencioTimeoutRef.current = null;
        }
        if (!grabandoRef.current && estadoRef.current === "escuchando") {
          empezarSegmento();
        }
      } else if (grabandoRef.current && !silencioTimeoutRef.current) {
        silencioTimeoutRef.current = setTimeout(() => {
          silencioTimeoutRef.current = null;
          detenerSegmento();
        }, SILENCIO_MS);
      }

      rafRef.current = requestAnimationFrame(paso);
    };

    rafRef.current = requestAnimationFrame(paso);
  }, [empezarSegmento, detenerSegmento]);

  const iniciar = useCallback(async (): Promise<ResultadoInicioVoz> => {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      return { ok: false, motivo: "no-soportado" };
    }

    const AudioContextCtor =
      window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) {
      return { ok: false, motivo: "no-soportado" };
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return { ok: false, motivo: "permiso-denegado" };
    }

    streamRef.current = stream;
    activoRef.current = true;

    const audioContext = new AudioContextCtor();
    const fuente = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    fuente.connect(analyser);

    audioContextRef.current = audioContext;
    analyserRef.current = analyser;

    actualizarEstado("escuchando");
    monitorear();

    return { ok: true };
  }, [actualizarEstado, monitorear]);

  const reanudarEscucha = useCallback(() => {
    if (activoRef.current) actualizarEstado("escuchando");
  }, [actualizarEstado]);

  // Red de seguridad: si el componente se desmonta o vuelve a montar de
  // forma inesperada, nunca debe quedar un stream de micrófono abierto.
  useEffect(() => {
    return () => detener();
  }, [detener]);

  return { estado, iniciar, detener, reanudarEscucha };
}
