// Link a la app del equipo "vita track" (repo micasrur/vita-track). La URL pública no figura en ese repo: sale de la variable
// NEXT_PUBLIC_VITA_TRACK_URL y, sin ella (o inválida), el link no se muestra. Solo https (http en localhost, para desarrollo).

export function urlVitaTrack(crudo: string | null | undefined): string | null {
  const v = (crudo ?? "").trim();
  if (!v) return null;
  try {
    const u = new URL(v);
    const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
    if (u.protocol !== "https:" && !(local && u.protocol === "http:")) return null;
    return u.toString();
  } catch {
    return null;
  }
}
