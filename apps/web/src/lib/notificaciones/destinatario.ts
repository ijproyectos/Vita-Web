// A quién le avisa vita, dicho en el texto de un formulario: a la cuenta
// logueada ("te avisa") o a la persona a cargo que se está cargando ("le
// avisa a Jesús"). Lógica pura (cliente y servidor).

/** "te avisa" / "le avisa a Jesús". `paraNombre` = primer nombre si el perfil activo no es el propio. */
export function verboAvisa(paraNombre?: string | null): string {
  const nombre = paraNombre?.trim();
  return nombre ? `le avisa a ${nombre}` : "te avisa";
}
