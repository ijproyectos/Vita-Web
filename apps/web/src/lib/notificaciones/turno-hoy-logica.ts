// "Hoy a las 15:30 tenés Cardiología": para el turno de HOY que no recibió el
// aviso de la noche anterior (lo cargaron hoy, o después de las 23 del día
// anterior). Sale una sola vez, en el primer tick del cron que corresponda.
// Lógica pura (la importan los tests); el envío vive en programados.ts.

/** Desde esta hora sale para cualquier turno del día; antes, solo si faltan <= 3 h. */
const DESDE_HORA = "07:00";
const MAX_MIN_DE_MADRUGADA = 180;

export function debeAvisarTurnoHoy(d: { faltanMin: number; horaAR: string; huboAvisoDiaAntes: boolean }): boolean {
  if (d.huboAvisoDiaAntes) return false;
  if (d.faltanMin <= 0) return false;
  // En la ventana de "2 horas antes" ya sale ese aviso: no se mandan dos juntos.
  if (d.faltanMin > 105 && d.faltanMin <= 120) return false;
  return d.horaAR >= DESDE_HORA || d.faltanMin <= MAX_MIN_DE_MADRUGADA;
}
