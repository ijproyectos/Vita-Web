// Tipos compartidos entre el hook cliente (usar-grabacion-voz.ts), el
// endpoint de transcripción y el núcleo de voz — mismo criterio que
// lib/estudios/tipos.ts (tipos mínimos, sin lógica).

/** Resultado de transcribir un turno de audio grabado. */
export type ResultadoTranscripcion = { texto: string } | { error: string };

/** Resultado de sintetizar la respuesta de vita a audio. */
export type ResultadoAudio = { audio: ArrayBuffer } | { error: string };

/**
 * Estado del modo voz, expuesto por useGrabacionVoz para que la UI refleje
 * el ciclo completo: inactivo -> escuchando (esperando que el usuario
 * hable) -> grabando (voz detectada, VAD activo) -> procesando
 * (transcribiendo) -> hablando (vita responde por TTS) -> vuelve a
 * escuchando si el modo voz sigue activo.
 */
export type EstadoVoz = "inactivo" | "escuchando" | "grabando" | "procesando" | "hablando";
