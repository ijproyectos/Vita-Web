// Limpia texto que escribe un usuario (nombre/relación de un familiar) antes de
// que entre a un prompt o al texto de un resultado de tool, para que no pueda
// colar líneas, comillas ni instrucciones. Módulo compartido (route.ts y destino.ts).
export function limpiarDato(valor: string, max = 40): string {
  return valor
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029"<>`]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}
