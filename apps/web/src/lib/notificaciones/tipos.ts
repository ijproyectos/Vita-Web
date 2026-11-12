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
  /** Fecha de pared en Argentina ("YYYY-MM-DD") de la dosis — la misma de
   * `medicamentos_tomas.fecha` y clave de dedupe en `alertas_dosis`. */
  fechaAR: string;
  elderNombre: string;
  /** Cuidadores `aceptado` del elder — destinatarios de la alerta push. */
  cuidadorIds: string[];
  /** Rol de cada cuidador sobre el elder: decide a dónde lleva el aviso (ficha o /app). */
  rolPorCuidador: Record<string, "editar" | "ver">;
  /** Relación que cargó cada cuidador en su vínculo ("Mamá"), para nombrarla en el aviso. */
  relacionPorCuidador?: Record<string, string | null>;
  /** Avisos que ya le llegaron a la persona por esta toma (`dosis_hora` y `dosis_segundo`, con `ref_id` = id del medicamento; la pospuesta no cuenta). */
  avisosEnviados?: number;
  /** Emails de esos cuidadores; solo se resuelven si hay RESEND_API_KEY. */
  destinatarios: string[];
};

/** Resultado de enviar el email de alerta de dosis vencida vía Resend. */
export type ResultadoAlertaDosis = { enviados: number } | { error: string };
