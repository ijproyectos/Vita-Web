// Textos PUROS de la charla de voz del modo simple (voseo, frases cortas). Sin I/O.
import { unirNombres } from "./respuestas";

/** Lo primero que se le manda al modelo después de "¿Cómo estás hoy?" (vita preguntó, la persona contesta). */
export const PREFIJO_ANIMO = "Vita me preguntó cómo estoy hoy. ";

export const TEXTO_NO_ENTENDI = "Perdón, no te escuché bien. ¿Me lo decís de nuevo?";
export const TEXTO_MEDICION_NO = "Bueno, no lo anoto.";
export const TEXTO_MEDICION_OK = "Listo, lo anoté.";

const conNombre = (base: string, nombre: string) => (nombre.trim() ? `${base}, ${nombre.trim()}` : base);

export function textoSaludoAnimo(nombre: string): string {
  return `${conNombre("Hola", nombre)}. ¿Cómo estás hoy?`;
}

export function textoSinInternet(nombre: string): string {
  return `${conNombre("Ahora no tengo internet", nombre)}. Tus pastillas y turnos siguen guardados y te aviso igual.`;
}

export function textoAyudaEnviada(nombres: string[]): string {
  const limpios = nombres.filter((n) => typeof n === "string" && n.trim()).map((n) => n.trim());
  if (limpios.length === 0) return "";
  return `${unirNombres(limpios)} ${limpios.length > 1 ? "recibieron" : "recibió"} tu pedido`;
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
