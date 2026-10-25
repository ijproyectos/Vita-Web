// Respaldo de emergencia: si el modelo falla (proveedor caído, timeout) justo cuando la persona
// describe una posible emergencia, igual se le muestra la guía del 107/911. Detección por frases, pura
// y conservadora (prefiere un falso positivo a callar). Espeja la regla de "Seguridad clínica" del
// SYSTEM_PROMPT del chat.
//
// NOTA: otra rama (PR #15, commit f7b04fb) trae su propio `lib/ai/emergencia.ts`. Este módulo es
// independiente a propósito para poder unificarlos después sin conflictos de nombre.

export type TipoEmergencia = "medica" | "suicidio";

// Se comparan sobre texto en minúsculas y sin tildes ni signos.
const PATRONES_SUICIDIO = [
  /suicid/,
  /\b(quiero|quisiera|prefiero) morirme\b/,
  /\bme quiero morir\b/,
  /\bquitarme la vida\b/,
  /\bmatarme\b/,
  /\bno quiero (seguir )?viv(ir|iendo)\b/,
  /\b(hacerme|hacer|lastimarme) (me )?(dano|mal)\b/,
  /\bcortarme\b/,
  /\bterminar con (todo|mi vida)\b/,
  /\bacabar con (todo|mi vida)\b/,
];

const PATRONES_MEDICA = [
  // Dolor de pecho / infarto
  /\bdolor(es)? (fuerte |intenso |muy fuerte )?(en|de) (el |mi )?(pecho|torax)\b/,
  /\bme duele (mucho |fuerte )?(el )?pecho\b/,
  /\b(opresion|presion|puntada|punzada|aprieto) en (el )?pecho\b/,
  /\binfarto\b/,
  // Falta de aire
  /\bno (puedo|logro) respirar\b/,
  /\bno respiro\b/,
  /\b(me )?falta(n)? (el )?(aire|aliento)\b/,
  /\bme ahogo\b/,
  /\b(dificultad|cuesta|cuesta mucho) (para |al )?respirar\b/,
  // Desmayo / pérdida de conocimiento
  /\bdesmay/,
  /\bperd(i|io|ido) (el )?conocimiento\b/,
  /\binconsciente\b/,
  // ACV
  /\bcara caida\b/,
  /\bboca torcida\b/,
  /\b(no puedo|dificultad para|cuesta) hablar\b/,
  /\b(acv|derrame cerebral)\b/,
  // Sangrado
  /\bsangrado (abundante|fuerte)\b/,
  /\bmucha sangre\b/,
  /\bno (para|deja) de sangrar\b/,
  /\bhemorragia\b/,
  // Sobredosis / intoxicación
  /\bsobredosis\b/,
  /\bme pase (de|con) (las |la |mis )?(pastillas|dosis|medicacion|medicamentos?)\b/,
  /\btome (de mas|demasiad[ao]s?|muchas pastillas)\b/,
  /\b(intoxic|envenen)/,
];

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Tipo de emergencia que describe el mensaje, o null. El suicidio tiene prioridad (guía propia). */
export function detectarEmergencia(mensaje: string): TipoEmergencia | null {
  const t = normalizar(mensaje);
  if (!t) return null;
  if (PATRONES_SUICIDIO.some((p) => p.test(t))) return "suicidio";
  if (PATRONES_MEDICA.some((p) => p.test(t))) return "medica";
  return null;
}

/** Texto de guía que se muestra cuando el modelo falló. Neutro en género, como el prompt. */
export function textoEmergenciaRespaldo(tipo: TipoEmergencia): string {
  if (tipo === "suicidio") {
    return "Lo que contás es importante y no tenés que pasarlo a solas. Si estás en peligro ahora, llamá ya al 107 (emergencias médicas) o al 911. También podés hablar ahora con la Línea 135 (CABA y GBA) o al (011) 5275-1135, de Asistencia al Suicida. Avisale a alguien cercano para que esté con vos.";
  }
  return "Si es una emergencia, llamá ya al 107 (emergencias médicas) o al 911, sin esperar. Si hay alguien cerca, pedile que te acompañe. Cuando estés a salvo, escribime de nuevo.";
}
