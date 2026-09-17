// Tipos del dominio de notificaciones (alerta de dosis vencida) — mismo
// criterio que lib/voz/tipos.ts: tipos mínimos, sin lógica.

/**
 * Una dosis que superó `hora_programada` + el margen de gracia sin una
 * `medicamentos_tomas` confirmada, junto con los emails de los
 * cuidadores `aceptado` del elder que deben ser notificados. Devuelta por
 * `detectarDosisVencidas` — pura detección, no implica que ya se haya
 * enviado ni registrado ninguna alerta (eso lo hace el cron route,
 * Fase 3, con el dedupe de `alertas_dosis`).
 */
export type DosisVencida = {
  medicamentoId: string;
  elderId: string;
  nombre: string;
  dosis: string | null;
  unidad: string;
  horaProgramada: string;
  /** Fecha en UTC ("YYYY-MM-DD") — la misma que usa `alertas_dosis` para
   * el dedupe, ver el comentario sobre el desfase UTC/AR en nucleo.ts. */
  fecha: string;
  destinatarios: string[];
};

/** Resultado de enviar el email de alerta de dosis vencida vía Resend. */
export type ResultadoAlertaDosis = { enviados: number } | { error: string };
