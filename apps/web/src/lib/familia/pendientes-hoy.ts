// "Hoy" de la ficha de una persona a cargo (V7): dosis que ya pasaron y siguen
// sin confirmar. Lógica pura; `ahora` y `hora_programada` están en hora AR.

export type DosisHoy = {
  id: string;
  nombre: string;
  dosis: string | null;
  unidad: string;
  hora_programada: string;
  tomado: boolean;
};

export type DosisPendiente = { id: string; nombre: string; meta: string };

function aMinutos(hora: string): number {
  return Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5));
}

function hace(minutos: number): string {
  return minutos < 60 ? `hace ${minutos} min` : `hace ${Math.floor(minutos / 60)} h`;
}

/**
 * `omitidas`: ids con "No la tomé" (057, modo simple). Salen de "sin confirmar"
 * (no tiene sentido recordarle) y van aparte en `noTomadas`.
 */
export function resumenHoy(
  dosis: DosisHoy[],
  ahora: string,
  omitidas: Set<string> = new Set()
): { subtitulo: string; pendientes: DosisPendiente[]; noTomadas: DosisPendiente[] } {
  const tomadas = dosis.filter((d) => d.tomado).length;
  const noTomadas = dosis
    .filter((d) => !d.tomado && omitidas.has(d.id))
    .sort((a, b) => a.hora_programada.localeCompare(b.hora_programada))
    .map((d) => ({ id: d.id, nombre: d.nombre, meta: `${d.hora_programada.slice(0, 5)} hs · dijo que no la tomó` }));
  const pendientes = dosis
    .filter((d) => !d.tomado && !omitidas.has(d.id) && aMinutos(d.hora_programada) < aMinutos(ahora))
    .sort((a, b) => a.hora_programada.localeCompare(b.hora_programada))
    .map((d) => {
      const hora = d.hora_programada.slice(0, 5);
      const cantidad = d.dosis?.trim() ? `${d.dosis.trim()} ${d.unidad}` : null;
      const cuando = `${hora} hs · ${hace(aMinutos(ahora) - aMinutos(hora))}`;
      return { id: d.id, nombre: d.nombre, meta: cantidad ? `${cantidad} · ${cuando}` : cuando };
    });
  return { subtitulo: `${tomadas} de ${dosis.length} tomadas`, pendientes, noTomadas };
}
