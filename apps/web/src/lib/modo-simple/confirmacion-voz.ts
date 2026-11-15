// ¿La persona dijo que ya tomó la pastilla? PURO. Se usa después del anuncio
// por voz del modo simple. Ante la duda NO confirma: marcar tomada una pastilla
// que no se tomó es peor que pedirle que toque el botón.
//
// Antes era una regex con `\b`, que en JavaScript no reconoce las letras con
// tilde: "Sí" o "ya está" (como los transcribe Whisper) no confirmaban, y
// "no sé si la tomé" confirmaba por el "si" suelto.

const NEGACIONES = ["no", "todavia", "despues", "luego", "tarde", "nunca", "ningun", "ninguna", "olvide", "espera", "esperame"];

const AFIRMACIONES_SUELTAS = ["si", "listo", "lista", "tomada", "tomado", "tome", "tomamos", "hecho", "dale", "claro"];
const AFIRMACIONES_FRASE = ["ya esta", "ya la tome", "ya lo tome", "ya las tome", "ya los tome", "ya tome", "recien la tome"];

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function confirmoPorVoz(texto: string): boolean {
  const limpio = normalizar(texto);
  if (!limpio) return false;
  const palabras = limpio.split(" ");
  if (palabras.some((p) => NEGACIONES.includes(p))) return false;
  if (palabras.includes("se") && palabras.includes("si")) return false; // "se si…" sin tilde, por las dudas
  const conEspacios = ` ${limpio} `;
  if (AFIRMACIONES_FRASE.some((f) => conEspacios.includes(` ${f} `))) return true;
  return palabras.some((p) => AFIRMACIONES_SUELTAS.includes(p));
}

export type IntencionPendiente = "tome" | "posponer" | "no_tome" | "otra";

const POSPONER_FRASE = ["mas tarde", "en un rato", "un rato", "ahora no", "todavia no", "despues", "luego", "esperame", "espera"];

/**
 * Lo que dijo con una pastilla pendiente (botón de vita de abajo). PURO.
 * "no_tome" nunca guarda solo: la pantalla pregunta antes. Ante una mezcla
 * ("no, ya la tomé") devuelve "otra" y lo resuelve la charla.
 */
export function interpretarVozPendiente(texto: string): IntencionPendiente {
  const limpio = normalizar(texto);
  if (!limpio) return "otra";
  // "¿Ya tomé?" es una pregunta, no una confirmación (Whisper conserva los signos).
  if (/[¿?]/.test(texto)) return "otra";
  const palabras = limpio.split(" ");
  const conEspacios = ` ${limpio} `;
  const afirma = AFIRMACIONES_FRASE.some((f) => conEspacios.includes(` ${f} `));
  const iNo = palabras.indexOf("no");
  const niega = iNo >= 0 && palabras.slice(iNo + 1, iNo + 5).some((p) => p.startsWith("tom"));
  if (niega) return afirma ? "otra" : "no_tome";
  if (POSPONER_FRASE.some((f) => conEspacios.includes(` ${f} `))) return afirma ? "otra" : "posponer";
  return confirmoPorVoz(texto) ? "tome" : "otra";
}

/** Las tres preguntas que el modo simple responde sin IA, dichas con otras palabras. PURO. */
export function preguntaLocal(texto: string): "turno" | "tome" | "toca" | null {
  const limpio = normalizar(texto);
  if (!limpio) return null;
  const conEspacios = ` ${limpio} `;
  if (/ turno /.test(conEspacios) || conEspacios.includes(" medico ") || conEspacios.includes(" doctor ")) return "turno";
  if (conEspacios.includes(" ya tome ") || conEspacios.includes(" tome la ") || conEspacios.includes(" tome las ")) return "tome";
  if (conEspacios.includes(" me toca") || conEspacios.includes(" tengo que tomar ")) return "toca";
  return null;
}
