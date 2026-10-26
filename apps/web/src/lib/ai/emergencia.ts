// Red de seguridad ESTÁTICA para emergencias: si el modelo no puede responder
// (límite diario de IA, error de Anthropic), el servidor igual devuelve un texto
// fijo con los teléfonos. No es detección de ánimo ni reemplaza al modelo: solo
// palabras clave de situaciones donde un silencio puede costar caro.

export type TipoEmergencia = "suicidio" | "intoxicacion" | "emergencia";

function norm(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ");
}

const SUICIDIO =
  /\b(me quiero (morir|matar)|quiero (morirme|matarme|morir)|suicid\w*|no quiero (seguir )?vivir|quitarme la vida|hacerme dano|matarme)\b/;
const INTOXICACION =
  /\b(tome de mas|tomo de mas|intoxic\w*|envenen\w*|sobredosis|tome (el )?doble|tomo (el )?doble|doble dosis|tome (dos|2) veces|me equivoque de (pastilla|pastillas|medicamento|remedio)|se equivoco de (pastilla|pastillas|medicamento|remedio)|tomo (dos|2) veces)\b/;
const EMERGENCIA =
  /\b(dolor (fuerte |intenso )?(de|en el) pecho|presion en el pecho|no (puede|puedo) respirar|me ahogo|se ahoga|falta de aire|(se )?desmay\w*|desmayo|convuls\w*|sangrad\w*|sangra mucho|hemorragia|inconsciente|no responde|cara caida|anafilax\w*|infarto|acv|se (le )?hincho (la )?(cara|garganta|lengua)|hipoglucemia|hiperglucemia)\b/;

export function detectarEmergencia(texto: string): TipoEmergencia | null {
  const t = norm(texto);
  if (SUICIDIO.test(t)) return "suicidio";
  if (INTOXICACION.test(t)) return "intoxicacion";
  if (EMERGENCIA.test(t)) return "emergencia";
  return null;
}

export function textoEmergencia(tipo: TipoEmergencia): string {
  switch (tipo) {
    case "suicidio":
      return "Lo que contás es importante y no tenés que pasarlo solo o sola. Si estás en peligro ahora, llamá ya al 107 (emergencias médicas) o al 911. Podés hablar con alguien en la Línea 135 (CABA y GBA, gratis, 24 h) o al (011) 5275-1135 de Asistencia al Suicida. Si podés, avisale a alguien cercano que esté con vos.";
    case "intoxicacion":
      return "Esto puede ser una intoxicación. Llamá ya al Centro Nacional de Intoxicaciones: 0800-333-0160 (Hospital Posadas, las 24 h, gratis). Si hay síntomas como somnolencia, vómitos, dificultad para respirar, confusión o desmayo, llamá al 107 o al 911. No tomes nada más hasta hablar con ellos o con tu médico.";
    default:
      return "Esto puede ser una emergencia. Llamá ya al 107 (emergencias médicas) o al 911 y, si podés, pedile a alguien cercano que esté con la persona. No esperes a que se pase solo.";
  }
}
