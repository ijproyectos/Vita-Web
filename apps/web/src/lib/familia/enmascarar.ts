// Muestra un email sin revelarlo entero, para pantallas que ve alguien que todavía no probó ser su dueño
// (la invitación antes de iniciar sesión, o una sesión con otra cuenta): "martina@gmail.com" -> "ma•••@gmail.com".
export function enmascararEmail(email: string): string {
  const limpio = email.trim();
  const arroba = limpio.lastIndexOf("@");
  if (arroba <= 0 || arroba === limpio.length - 1) return "•••";
  const usuario = limpio.slice(0, arroba);
  const dominio = limpio.slice(arroba + 1);
  const visible = usuario.length <= 2 ? usuario.slice(0, 1) : usuario.slice(0, 2);
  return `${visible}•••@${dominio}`;
}
