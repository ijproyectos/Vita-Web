// Destino de redireccion que viene de un parametro `next` (controlado por
// quien arma el link): solo se aceptan rutas internas. Cualquier otra cosa
// (URL absoluta, `//host`, barras invertidas, caracteres de control o
// codificados que se resuelvan a lo anterior) cae al destino por defecto.
const CONTROL = /[\u0000-\u001f\u007f]/;

export function destinoSeguro(next: string | null | undefined, porDefecto = "/app"): string {
  if (typeof next !== "string" || next.length === 0 || next.length > 2048) return porDefecto;
  if (!next.startsWith("/")) return porDefecto;
  if (next.startsWith("//") || next.includes("\\")) return porDefecto;
  if (CONTROL.test(next)) return porDefecto;

  // Una pasada de decodificacion: `/%2F%2Fevil.com` o `/%5Cevil.com` no deben
  // colarse si algun intermediario los decodifica.
  let decodificado: string;
  try {
    decodificado = decodeURIComponent(next);
  } catch {
    return porDefecto;
  }
  if (decodificado.startsWith("//") || decodificado.includes("\\")) return porDefecto;
  if (CONTROL.test(decodificado)) return porDefecto;

  return next;
}
