// Textos PUROS de la charla de voz del modo simple (voseo, frases cortas). Sin I/O.

/** Lo primero que se le manda al modelo después de "¿Cómo estás hoy?" (vita preguntó, la persona contesta). */
export const PREFIJO_ANIMO = "Vita me preguntó cómo estoy hoy. ";

export const TEXTO_NO_ENTENDI = "Perdón, no te escuché bien. ¿Me lo decís de nuevo?";
/** Timeout, corte de red o error sin mensaje: no es que no se la haya escuchado. */
export const TEXTO_SIN_CONEXION_PEDIDO = "No pude conectarme. Probá de nuevo en un ratito.";
export const TEXTO_CORTADA = "Se me cortó la respuesta. Si querés, preguntame de nuevo.";

/**
 * Texto final de una respuesta de vita: si el stream se cortó (timeout, conexión) lo que
 * llegó se muestra igual, pero avisando que quedó incompleto en vez de presentarlo entero.
 */
export function textoRespuestaFinal(acumulado: string, cortada: boolean, error: string | null): string {
  const texto = acumulado.trim();
  if (!texto) return error || (cortada ? TEXTO_SIN_CONEXION_PEDIDO : TEXTO_NO_ENTENDI);
  return cortada ? `${texto} ${TEXTO_CORTADA}` : texto;
}
export const TEXTO_MEDICION_NO = "Bueno, no lo anoto.";
export const TEXTO_MEDICION_OK = "Listo, lo anoté.";

const conNombre = (base: string, nombre: string) => (nombre.trim() ? `${base}, ${nombre.trim()}` : base);

export function textoSaludoAnimo(nombre: string): string {
  return `${conNombre("Hola", nombre)}. ¿Cómo estás hoy?`;
}

export function textoSinInternet(nombre: string): string {
  return `${conNombre("Ahora no tengo internet", nombre)}. Tus pastillas y turnos siguen guardados y te aviso igual. Si necesitás ayuda, llamá a tu familia.`;
}

export type MedicionPropuesta = { tipo: "glucemia" | "presion"; valor: number; valorSecundario?: number | null };

/** Valida el payload de la acción `medicion_propuesta` (viene del servidor, pero se re-chequea la forma). */
export function leerMedicionPropuesta(accion: Record<string, unknown>): MedicionPropuesta | null {
  const { tipo, valor, valorSecundario } = accion;
  if ((tipo !== "glucemia" && tipo !== "presion") || typeof valor !== "number" || !Number.isFinite(valor)) return null;
  const sec = typeof valorSecundario === "number" && Number.isFinite(valorSecundario) ? valorSecundario : null;
  if (tipo === "presion" && sec === null) return null;
  return { tipo, valor, valorSecundario: tipo === "presion" ? sec : null };
}

export function etiquetaMedicion(m: MedicionPropuesta): { etiqueta: string; valor: string; unidad: string } {
  return m.tipo === "presion"
    ? { etiqueta: "Presión", valor: `${m.valor}/${m.valorSecundario}`, unidad: "mmHg" }
    : { etiqueta: "Azúcar", valor: String(m.valor), unidad: "mg/dL" };
}

/** "Azúcar 110. ¿Lo anoto así?" / "Presión 130/80. ¿Lo anoto así?" */
export function textoPreguntaMedicion(m: MedicionPropuesta): string {
  const { etiqueta, valor } = etiquetaMedicion(m);
  return `${etiqueta} ${valor}. ¿Lo anoto así?`;
}

/** Cuánto se espera con el contexto de audio suspendido antes de pedir que toquen el micrófono. */
export const ESPERA_SIN_OIR_MS = 8_000;
export const TEXTO_TOCA_EL_MIC = "Tocá el micrófono y contame.";
export const TEXTO_SIN_PERMISO_MIC = "Necesito permiso para usar el micrófono. Podés escribirme.";
export const TEXTO_SIN_MIC = "Este celular no deja usar el micrófono acá.";
export const LARGO_MAXIMO_MENSAJE = 4000;

export type DestinoEscucha = "escuchando" | "tocar-mic" | "escribir";

/** Qué hace la vista después de intentar abrir el micrófono por su cuenta (fuera de un gesto). */
export function destinoTrasIniciar(r: { ok: true; suspendido?: boolean } | { ok: false; motivo: string }): DestinoEscucha {
  if (!r.ok) return "escribir";
  return r.suspendido ? "tocar-mic" : "escuchando";
}

/** Watchdog: escuchando, sin haber grabado nada, con el contexto suspendido y pasado el plazo. */
export function escuchaTrabada(estadoVoz: string, contextoSuspendido: boolean, esperadoMs: number): boolean {
  return estadoVoz === "escuchando" && contextoSuspendido && esperadoMs >= ESPERA_SIN_OIR_MS;
}

export function textoSinMic(motivo: "no-soportado" | "permiso-denegado"): string {
  return motivo === "permiso-denegado" ? TEXTO_SIN_PERMISO_MIC : TEXTO_SIN_MIC;
}

/** Texto listo para enviar desde el campo de escribir: recortado y con tope; "" si no hay nada. */
export function textoParaEnviar(borrador: string): string {
  return borrador.trim().slice(0, LARGO_MAXIMO_MENSAJE);
}
