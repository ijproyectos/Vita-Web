// Muestra un mail sin revelarlo entero: `martina@gmail.com` -> `m•••@gmail.com`.
// Pura y tolerante: ante algo que no parece un mail devuelve "•••" en vez de
// filtrar el texto original.
export function enmascararEmail(email: string | null | undefined): string {
  const limpio = (email ?? "").trim();
  const arroba = limpio.lastIndexOf("@");
  if (arroba < 1 || arroba === limpio.length - 1) return "•••";
  const local = limpio.slice(0, arroba);
  const dominio = limpio.slice(arroba + 1);
  const [primera] = Array.from(local);
  return `${primera}•••@${dominio}`;
}
