// Tipos y helpers puros de Avisos (centro de notificaciones + preferencias).
// Sin `server-only` a propósito: los componentes de cliente (config, lista)
// importan de acá las mismas reglas que usa el cron.

export type TipoAviso =
  | "dosis"
  | "dosis_segundo"
  | "dosis_pospuesta"
  | "dosis_vencida_cuidador"
  | "dosis_resuelta_cuidador"
  | "recordatorio_familiar"
  | "turno_dia_antes"
  | "turno_2h"
  | "stock_bajo";

export type Aviso = {
  id: string;
  usuario_id: string;
  tipo: string;
  titulo: string;
  cuerpo: string;
  url: string | null;
  datos: Record<string, unknown>;
  leido_at: string | null;
  created_at: string;
};

export const ESPERAS_CUIDADOR = [
  { min: 30, label: "30 min" },
  { min: 60, label: "1 hora" },
  { min: 120, label: "2 horas" },
] as const;

export type PreferenciasAvisos = {
  /** "HH:MM" o null (sin silencio). Ambos null o ambos presentes. */
  silencio_desde: string | null;
  silencio_hasta: string | null;
  espera_cuidador_min: number;
  recordatorio_dosis: boolean;
  aviso_turnos: boolean;
  stock_bajo: boolean;
};

/** Sin fila en `preferencias_avisos`: todo activado, sin silencio, 30 min. */
export const PREFERENCIAS_POR_DEFECTO: PreferenciasAvisos = {
  silencio_desde: null,
  silencio_hasta: null,
  espera_cuidador_min: 30,
  recordatorio_dosis: true,
  aviso_turnos: true,
  stock_bajo: true,
};

/** Rango sugerido al prender el silencio por primera vez (el del diseño). */
export const SILENCIO_SUGERIDO = { desde: "23:00", hasta: "07:00" } as const;

export const MINUTOS_POSPONER_SERVIDOR = 15;

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function esHoraValida(valor: unknown): valor is string {
  return typeof valor === "string" && HHMM.test(valor);
}

/** "23:00:00" (columna time de Postgres) -> "23:00". */
export function recortarHora(valor: string | null | undefined): string | null {
  if (!valor) return null;
  return valor.slice(0, 5);
}

function aMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/**
 * ¿`ahoraHHMM` (hora AR) cae dentro del silencio nocturno? El rango puede
 * cruzar la medianoche (23:00 -> 07:00). Sin silencio configurado: false.
 */
export function enSilencioNocturno(
  prefs: Pick<PreferenciasAvisos, "silencio_desde" | "silencio_hasta">,
  ahoraHHMM: string
): boolean {
  if (!prefs.silencio_desde || !prefs.silencio_hasta) return false;
  const desde = aMinutos(prefs.silencio_desde);
  const hasta = aMinutos(prefs.silencio_hasta);
  const ahora = aMinutos(ahoraHHMM);
  if (desde === hasta) return false;
  return desde < hasta ? ahora >= desde && ahora < hasta : ahora >= desde || ahora < hasta;
}

/** Minutos transcurridos desde `programadaHHMM` hasta `ahoraHHMM`, módulo 24 h. */
export function minutosDesde(programadaHHMM: string, ahoraHHMM: string): number {
  return (aMinutos(ahoraHHMM) - aMinutos(programadaHHMM) + 1440) % 1440;
}
