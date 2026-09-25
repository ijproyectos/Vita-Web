// Tipos del dominio de vínculos cuidador↔elder — ver
// supabase/migrations/008_cuidadores.sql para el schema real (tablas,
// RLS, RPCs). Mismo criterio que el resto del proyecto: tipos mínimos,
// sin lógica.

export type EstadoVinculo = "pendiente" | "aceptado" | "revocado";

export type VinculoCuidador = {
  id: string;
  // Nullable desde 010_onboarding_rol_y_vinculo_por_codigo.sql: null hasta
  // que el elder reclama un vínculo iniciado por el cuidador (dirección b,
  // por código/QR) — antes siempre venía set porque solo existía la
  // dirección elder→cuidador (a, por link).
  elder_id: string | null;
  cuidador_id: string | null; // null hasta que el cuidador reclama la invitación (dirección a)
  email_invitado: string;
  token: string;
  // Código numérico de 6 dígitos para la dirección (b) — null en filas de
  // la dirección (a) (por link/email). Ver `crearVinculoComoCuidador` en
  // nucleo.ts.
  codigo: string | null;
  estado: EstadoVinculo;
  expira_at: string;
  aceptado_at: string | null;
  created_at: string;
};

/**
 * Fila devuelta por la RPC `listar_elders_vinculados()` — exactamente
 * estas dos columnas, nunca el resto de `perfiles` (RLS es de fila, no
 * de columna: una policy de select en `perfiles` expondría
 * condiciones/alergias/peso_kg/obra_social).
 */
export type ElderVinculado = {
  elderId: string;
  nombre: string;
};

/** Motivo por el que `reclamar_invitacion_cuidador()` rechazó un reclamo —
 * calca los `raise exception` de la RPC (ver 008_cuidadores.sql). */
export type MotivoReclamoRechazado =
  | "invitacion_no_encontrada"
  | "invitacion_expirada"
  | "invitacion_no_corresponde_a_esta_cuenta"
  | "error_desconocido";

/**
 * Resultado de reclamar una invitación — nunca lanza (ver
 * `reclamarInvitacion` en nucleo.ts): la excepción que puede tirar la RPC
 * `security definer` se atrapa ahí mismo y se traduce a este shape.
 */
export type ResultadoReclamo =
  | { elderId: string; nombre: string }
  | { error: MotivoReclamoRechazado; mensaje: string };

/** Motivo por el que `reclamar_vinculo_como_elder()` rechazó un reclamo —
 * calca los `raise exception` de la RPC (ver
 * 010_onboarding_rol_y_vinculo_por_codigo.sql). Simétrico a
 * `MotivoReclamoRechazado`, dirección (b) — el elder reclama un vínculo
 * que el cuidador inició por código/QR. */
export type MotivoReclamoElderRechazado =
  | "codigo_no_encontrado"
  | "codigo_expirado"
  | "ya_vinculado"
  | "error_desconocido";

/**
 * Resultado de reclamar un vínculo por código — nunca lanza (ver
 * `reclamarVinculoComoElder` en nucleo.ts), mismo criterio que
 * `ResultadoReclamo`.
 */
export type ResultadoReclamoElder =
  | { cuidadorId: string; nombre: string }
  | { error: MotivoReclamoElderRechazado; mensaje: string };

/**
 * Una dosis vencida sin confirmar, ya resuelta con el nombre del elder —
 * para el popup de alerta que ve el cuidador dentro de la app (ver
 * `listarDosisVencidasDeMisElders` en nucleo.ts). No tiene relación con
 * `alertas_dosis` (esa tabla es dedupe/log del cron de email, que por
 * ahora está desactivado — este tipo es puramente de lectura en vivo).
 */
export type DosisVencidaCuidador = {
  elderId: string;
  elderNombre: string;
  medicamentoId: string;
  nombre: string;
  dosis: string | null;
  unidad: string;
  horaProgramada: string;
};
