// Fecha de nacimiento: lectura de lo que dice la persona, validación, edad y
// cumpleaños. Todo PURO (sin acceso a datos ni `server-only`): lo usan el
// servidor (Server Actions, cron, chat) y el cliente (la charla del onboarding).
// Las fechas son "YYYY-MM-DD"; "hoy" siempre llega por parámetro (fecha AR).

export type PartesFecha = { dia: number | null; mes: number | null; anio: number | null };

export const PARTES_VACIAS: PartesFecha = { dia: null, mes: null, anio: null };

/** Pasada esta edad se pregunta si no fue un error de tipeo. */
export const EDAD_SOSPECHOSA = 120;
/** Pasada esta edad no se acepta: se pide corregirla. */
export const EDAD_MAXIMA = 130;

const MESES: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  setiembre: 9,
  septiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};
const NOMBRES_MES = Object.keys(MESES).join("|");

function partesDeHoy(hoyISO: string): { anio: number; mes: number; dia: number } {
  const [anio, mes, dia] = hoyISO.split("-").map(Number);
  return { anio, mes, dia };
}

/** "50" -> 1950, "26" -> 2026 (un nacimiento nunca es futuro); "1950" queda igual. */
export function expandirAnio(valor: number, hoyISO: string): number {
  if (valor >= 100) return valor;
  const { anio } = partesDeHoy(hoyISO);
  const sigloActual = anio - (anio % 100);
  return valor + sigloActual <= anio ? valor + sigloActual : valor + sigloActual - 100;
}

/**
 * Lee día/mes/año de un texto libre: "12/3/1950", "12-03-50", "12 de marzo del
 * 50", "marzo de 1950", "nací en 1950". No inventa lo que no está: lo que no
 * aparece queda en null.
 */
export function leerPartesFecha(texto: string, hoyISO: string): PartesFecha {
  const t = texto.toLowerCase().trim();

  const numerica = t.match(/(?<!\d)(\d{1,2})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{4}|\d{2})(?!\d)/);
  if (numerica) {
    return { dia: Number(numerica[1]), mes: Number(numerica[2]), anio: expandirAnio(Number(numerica[3]), hoyISO) };
  }

  const textual = t.match(new RegExp(`(?:(?<!\\d)(\\d{1,2})\\s+(?:de\\s+)?)?\\b(${NOMBRES_MES})\\b(?:\\s+(?:de[l]?\\s+)?(\\d{4}|\\d{2})(?!\\d))?`));
  if (textual) {
    return {
      dia: textual[1] ? Number(textual[1]) : null,
      mes: MESES[textual[2]],
      anio: textual[3] ? expandirAnio(Number(textual[3]), hoyISO) : null,
    };
  }

  // Día y mes sin año ("12/3"): sirve para completar un año ya dicho.
  const diaMes = t.match(/(?<![\d/])(\d{1,2})\s*[/\-.]\s*(\d{1,2})(?![\d/])/);
  if (diaMes) return { dia: Number(diaMes[1]), mes: Number(diaMes[2]), anio: null };

  const anio4 = t.match(/(?<!\d)(19\d{2}|20\d{2})(?!\d)/);
  if (anio4) return { dia: null, mes: null, anio: Number(anio4[1]) };

  const nacio2 = t.match(/\bnac[ií]\S*\s+(?:en\s+)?(?:el\s+)?(\d{2})(?!\d)/);
  if (nacio2) return { dia: null, mes: null, anio: expandirAnio(Number(nacio2[1]), hoyISO) };

  return PARTES_VACIAS;
}

/** "78", "78 años", "tiene 78 años" -> 78. Un número suelto solo cuenta si es todo el texto. */
export function leerEdad(texto: string): number | null {
  const t = texto.toLowerCase().trim();
  const conUnidad = t.match(/(?<![\d/])(\d{1,3})\s*a[ñn]os/);
  if (conUnidad) return Number(conUnidad[1]);
  const suelto = t.match(/^(\d{1,3})$/);
  return suelto ? Number(suelto[1]) : null;
}

/** Junta lo que ya se sabía con lo nuevo: lo nuevo completa los huecos, nunca borra. */
export function combinarPartes(base: PartesFecha, nuevo: PartesFecha): PartesFecha {
  return { dia: nuevo.dia ?? base.dia, mes: nuevo.mes ?? base.mes, anio: nuevo.anio ?? base.anio };
}

export function esFechaReal(anio: number, mes: number, dia: number): boolean {
  if (!Number.isInteger(anio) || !Number.isInteger(mes) || !Number.isInteger(dia)) return false;
  if (mes < 1 || mes > 12 || dia < 1) return false;
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  return d.getUTCFullYear() === anio && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

function aISO(anio: number, mes: number, dia: number): string {
  return `${String(anio).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Años cumplidos a `hoyISO`. */
export function edadDesdeFecha(fechaISO: string, hoyISO: string): number {
  const n = partesDeHoy(fechaISO);
  const h = partesDeHoy(hoyISO);
  let edad = h.anio - n.anio;
  if (h.mes < n.mes || (h.mes === n.mes && h.dia < n.dia)) edad--;
  return edad;
}

export type Nacimiento =
  /** Fecha completa y válida. */
  | { tipo: "fecha"; fecha: string; edad: number }
  /** Solo el año (edad aproximada). */
  | { tipo: "solo-anio"; anio: number; edad: number }
  /** Solo la edad. */
  | { tipo: "solo-edad"; edad: number }
  | { tipo: "nada" }
  | { tipo: "invalido"; motivo: "fecha-irreal" | "futuro" | "edad-imposible" };

/**
 * Resuelve lo que se pudo leer a una de las formas de `Nacimiento`, validando:
 * fecha real, no futura y edad <= EDAD_MAXIMA. `edadDicha` completa el año si
 * hay día y mes pero no año.
 */
export function resolverNacimiento(partes: PartesFecha, edadDicha: number | null, hoyISO: string): Nacimiento {
  const hoy = partesDeHoy(hoyISO);
  const { dia, mes } = partes;
  let anio = partes.anio;

  if (edadDicha !== null && (!Number.isInteger(edadDicha) || edadDicha < 0 || edadDicha > EDAD_MAXIMA)) {
    return { tipo: "invalido", motivo: "edad-imposible" };
  }

  if (dia !== null && mes !== null && anio === null && edadDicha !== null && esFechaReal(2000, mes, dia)) {
    // Día y mes más la edad: el año sale de cuántos años cumple.
    const yaCumplio = mes < hoy.mes || (mes === hoy.mes && dia <= hoy.dia);
    const calculado = hoy.anio - edadDicha - (yaCumplio ? 0 : 1);
    if (esFechaReal(calculado, mes, dia)) anio = calculado;
  }

  if (anio !== null) {
    if (anio > hoy.anio) return { tipo: "invalido", motivo: "futuro" };
    if (dia !== null && mes !== null) {
      if (!esFechaReal(anio, mes, dia)) return { tipo: "invalido", motivo: "fecha-irreal" };
      const fecha = aISO(anio, mes, dia);
      if (fecha > hoyISO) return { tipo: "invalido", motivo: "futuro" };
      const edad = edadDesdeFecha(fecha, hoyISO);
      if (edad > EDAD_MAXIMA) return { tipo: "invalido", motivo: "edad-imposible" };
      return { tipo: "fecha", fecha, edad };
    }
    if (mes !== null && (mes < 1 || mes > 12)) return { tipo: "invalido", motivo: "fecha-irreal" };
    const edad = hoy.anio - anio;
    if (edad > EDAD_MAXIMA) return { tipo: "invalido", motivo: "edad-imposible" };
    return { tipo: "solo-anio", anio, edad };
  }

  if ((dia !== null && (dia < 1 || dia > 31)) || (mes !== null && (mes < 1 || mes > 12))) {
    return { tipo: "invalido", motivo: "fecha-irreal" };
  }
  if (edadDicha !== null) return { tipo: "solo-edad", edad: edadDicha };
  return { tipo: "nada" };
}

/** Edad para mostrar, o null si no se sabe. */
export function edadDeNacimiento(n: Nacimiento | null): number | null {
  if (!n) return null;
  return n.tipo === "fecha" || n.tipo === "solo-anio" || n.tipo === "solo-edad" ? n.edad : null;
}

/** Pasada EDAD_SOSPECHOSA hay que confirmar con la persona (puede ser un error de tipeo). */
export function requiereConfirmarEdad(n: Nacimiento | null): boolean {
  const edad = edadDeNacimiento(n);
  return edad !== null && edad > EDAD_SOSPECHOSA;
}

export function mensajeNacimientoInvalido(motivo: "fecha-irreal" | "futuro" | "edad-imposible"): string {
  if (motivo === "futuro") return "Esa fecha todavía no llegó.";
  if (motivo === "edad-imposible") return "Esa edad no me cierra.";
  return "Esa fecha no existe.";
}

/** Año de nacimiento aproximado para guardar cuando solo se sabe el año o la edad. */
export function anioDeNacimiento(n: Nacimiento | null, hoyISO: string): number | null {
  if (!n) return null;
  if (n.tipo === "fecha") return Number(n.fecha.slice(0, 4));
  if (n.tipo === "solo-anio") return n.anio;
  if (n.tipo === "solo-edad") return partesDeHoy(hoyISO).anio - n.edad;
  return null;
}

/**
 * ¿Cumple años hoy? Solo con fecha completa. Quien nació un 29 de febrero
 * cumple el 28 en los años no bisiestos.
 */
export function esCumpleHoy(fechaNacimiento: string | null | undefined, hoyISO: string): boolean {
  if (!fechaNacimiento || !/^\d{4}-\d{2}-\d{2}/.test(fechaNacimiento)) return false;
  const n = partesDeHoy(fechaNacimiento.slice(0, 10));
  const h = partesDeHoy(hoyISO);
  if (!esFechaReal(n.anio, n.mes, n.dia) || fechaNacimiento.slice(0, 10) > hoyISO) return false;
  if (n.mes === 2 && n.dia === 29 && !esFechaReal(h.anio, 2, 29)) return h.mes === 2 && h.dia === 28;
  return n.mes === h.mes && n.dia === h.dia;
}

/** Años que cumple hoy (para "cumple 78"); null si hoy no es su cumpleaños. */
export function edadQueCumple(fechaNacimiento: string | null | undefined, hoyISO: string): number | null {
  if (!esCumpleHoy(fechaNacimiento, hoyISO)) return null;
  return partesDeHoy(hoyISO).anio - partesDeHoy(fechaNacimiento as string).anio;
}

/** Cómo se le muestra al usuario un nacimiento ya leído, para precargar un campo ("12/3/1950", "1950", "78 años"). */
export function textoDeNacimiento(n: Nacimiento | null): string {
  if (!n) return "";
  if (n.tipo === "fecha") {
    const [a, m, d] = n.fecha.split("-").map(Number);
    return `${d}/${m}/${a}`;
  }
  if (n.tipo === "solo-anio") return String(n.anio);
  if (n.tipo === "solo-edad") return `${n.edad} años`;
  return "";
}
