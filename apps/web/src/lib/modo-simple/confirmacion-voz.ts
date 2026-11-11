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
