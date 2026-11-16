// Umbrales de las observaciones de vita (etapa 1, sin IA). TODOS en este archivo, a propósito: son referencias
// generales, no criterios médicos personalizados, y un médico tiene que poder ajustarlos sin tocar las reglas.
// Puro y sin `server-only`: lo importan las reglas, los tests y las pantallas.

/** Stock: avisar cuando alcanza para esta cantidad de días o menos. */
export const STOCK_DIAS_MAXIMOS = 7;

/** Tomas salteadas: ventana en días (sin contar hoy) y cantidad mínima en la misma franja del día. */
export const SALTEADAS_VENTANA_DIAS = 7;
export const SALTEADAS_MINIMAS = 3;

/** Presión alta: ventana, cantidad mínima de mediciones y umbrales (mm Hg, sistólica / diastólica). */
export const PRESION_VENTANA_DIAS = 7;
export const PRESION_MEDICIONES_MINIMAS = 3;
export const PRESION_SISTOLICA_ALTA = 140;
export const PRESION_DIASTOLICA_ALTA = 90;

/** Glucemia fuera de rango: ventana, cantidad mínima y umbrales (mg/dL). */
export const GLUCEMIA_VENTANA_DIAS = 7;
export const GLUCEMIA_MEDICIONES_MINIMAS = 2;
export const GLUCEMIA_ALTA = 180;
export const GLUCEMIA_BAJA = 70;

/** Estudios: se mira un estudio cargado en los últimos N días. */
export const ESTUDIO_VENTANA_DIAS = 14;

/** Turno cerca: dentro de los próximos N días (hoy incluido). */
export const TURNO_CERCA_DIAS = 3;

/** Tratamiento que termina: `fecha_fin` dentro de los próximos N días (hoy incluido). */
export const TRATAMIENTO_TERMINA_DIAS = 3;

/** Medición pendiente: días sin ninguna medición de un monitoreo activo. */
export const MEDICION_PENDIENTE_DIAS = 3;

/** Familia sin tomas: días completos (sin contar hoy) sin ninguna toma marcada. */
export const FAMILIA_SIN_TOMAS_DIAS = 2;

/** Cuánto sigue vigente una observación basada en una ventana móvil (días desde que se genera). */
export const VIGENCIA_DIAS = 3;

/** Las observaciones vencidas se borran pasados estos días de `vigente_hasta`. */
export const RETENCION_DIAS_TRAS_VIGENCIA = 30;

/** Frase que cierra toda observación médica. */
export const FRASE_MEDICO = "Consultalo con tu médico.";

/** Tipos de observación que además mandan un push (máximo 1 por persona y por día). */
export const TIPOS_CON_PUSH = ["presion_alta", "glucemia_fuera_rango", "estudio_fuera_rango", "familia_sin_tomas"] as const;

/** Tope de observaciones que se muestran en el chat (bloque dinámico) y en el inicio. */
export const MAX_OBSERVACIONES_CHAT = 3;
