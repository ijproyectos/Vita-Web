// Tarjeta "X pidió ayuda" del Inicio: una vez que quien cuida la vio, se va
// sola a la hora. "Visto" se guarda por dispositivo (id del aviso -> momento
// en que apareció por primera vez); al vencer, el aviso se marca leído en el
// servidor y deja de mostrarse en todos lados. Lógica pura, sin storage.

export const MS_VISIBLE_TRAS_VERLO = 60 * 60 * 1000;

export type Vistos = Record<string, number>;

/** Avisos que ya se vieron hace más de una hora. */
export function vencidosTrasVerlos(ids: string[], vistos: Vistos, ahora: number): string[] {
  return ids.filter((id) => typeof vistos[id] === "number" && ahora - vistos[id] >= MS_VISIBLE_TRAS_VERLO);
}

/** Anota los que aparecen por primera vez y olvida los que ya no están. */
export function registrarVistos(ids: string[], vistos: Vistos, ahora: number): Vistos {
  const nuevo: Vistos = {};
  for (const id of ids) nuevo[id] = typeof vistos[id] === "number" ? vistos[id] : ahora;
  return nuevo;
}

/** Lee el JSON guardado; cualquier cosa rara = nada visto. */
export function parsearVistos(crudo: string | null): Vistos {
  if (!crudo) return {};
  try {
    const v: unknown = JSON.parse(crudo);
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const limpio: Vistos = {};
    for (const [k, n] of Object.entries(v)) if (typeof n === "number" && Number.isFinite(n)) limpio[k] = n;
    return limpio;
  } catch {
    return {};
  }
}
