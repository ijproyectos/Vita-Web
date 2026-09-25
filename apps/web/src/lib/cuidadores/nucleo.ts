import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { esDosisVencida, horaEnAR, listarHoy } from "@/lib/medicamentos/nucleo";
import type {
  DosisVencidaCuidador,
  ElderVinculado,
  ResultadoReclamo,
  ResultadoReclamoElder,
  VinculoCuidador,
} from "./tipos";

// Núcleo de lógica de vínculos cuidador↔elder — mismo criterio que
// lib/medicamentos/nucleo.ts: funciones puras `(supabase, usuarioId, ...)`
// consumidas por Server Actions, nunca reimplementadas en la UI.
type Cliente = SupabaseClient;

const DIAS_EXPIRACION_INVITACION = 7; // calca el default real de la columna `expira_at` en 008_cuidadores.sql

/**
 * Genera un token del mismo formato que el default de la columna
 * (`encode(gen_random_bytes(24), 'hex')`, 24 bytes → 48 chars hex) — solo
 * hace falta generarlo a mano acá porque el default de Postgres únicamente
 * aplica en un INSERT; reemitir un token sobre una fila existente (ver
 * `invitar` más abajo) es un UPDATE.
 */
function generarToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const MINUTOS_EXPIRACION_CODIGO = 30; // corto a propósito — ver comentario de crearVinculoComoCuidador

/**
 * Código numérico de 6 dígitos, uniforme, vía `crypto.getRandomValues` con
 * rejection sampling — `Math.floor(100000 + Math.random() * 900000)` no
 * alcanza (ni el generador ni la distribución) el rigor que necesita un
 * código de vínculo: `Math.random()` no es criptográficamente seguro, y un
 * `% 900000` directo sobre un uint32 sesga levemente los primeros valores
 * del rango. Mismo nivel de cuidado que `generarToken()` de acá arriba,
 * adaptado a un espacio de 6 dígitos en vez de 48 chars hex.
 */
function generarCodigo(): string {
  const MIN = 100000;
  const RANGO = 900000; // 100000..999999 inclusive
  const LIMITE = Math.floor(0x100000000 / RANGO) * RANGO; // corta el resto sesgado del uint32
  const buffer = new Uint32Array(1);
  let n: number;
  do {
    crypto.getRandomValues(buffer);
    n = buffer[0];
  } while (n >= LIMITE);
  return String(MIN + (n % RANGO));
}

/**
 * Crea una invitación pendiente del elder hacia un email de cuidador. Si
 * ya existe una invitación `pendiente` para ese mismo elder+email, se
 * reemite el token (y se extiende el vencimiento) sobre la fila
 * existente en vez de crear una segunda — no hay un unique constraint en
 * la DB que fuerce esto (el unique real es `(elder_id, cuidador_id)` una
 * vez reclamada), es una decisión de producto para no acumular
 * invitaciones pendientes duplicadas al mismo destinatario.
 *
 * No envía ningún email — la decisión confirmada con el usuario es que
 * la invitación es un link que el elder comparte a mano
 * (`/cuidar/invitacion/{token}`), Resend en este dominio se usa solo para
 * la alerta de dosis vencida (lib/notificaciones/nucleo.ts).
 */
export async function invitar(
  supabase: Cliente,
  elderId: string,
  emailInvitado: string
): Promise<VinculoCuidador> {
  const email = emailInvitado.trim().toLowerCase();

  const { data: existente, error: errorLectura } = await supabase
    .from("vinculos_cuidador")
    .select("*")
    .eq("elder_id", elderId)
    .eq("email_invitado", email)
    .eq("estado", "pendiente")
    .maybeSingle();

  if (errorLectura) {
    throw new Error(`No se pudo leer la invitación existente: ${errorLectura.message}`);
  }

  if (existente) {
    const { data, error } = await supabase
      .from("vinculos_cuidador")
      .update({
        token: generarToken(),
        expira_at: new Date(
          Date.now() + DIAS_EXPIRACION_INVITACION * 24 * 60 * 60 * 1000
        ).toISOString(),
      })
      .eq("id", existente.id)
      .select()
      .single();

    if (error) throw new Error(`No se pudo reemitir la invitación: ${error.message}`);
    return data as VinculoCuidador;
  }

  const { data, error } = await supabase
    .from("vinculos_cuidador")
    .insert({ elder_id: elderId, email_invitado: email })
    .select()
    .single();

  if (error) throw new Error(`No se pudo crear la invitación: ${error.message}`);
  return data as VinculoCuidador;
}

/** Todas las invitaciones/vínculos que el elder creó, en cualquier
 * estado — para la pantalla "Mis cuidadores" (Fase 3). */
export async function listarVinculosDeElder(
  supabase: Cliente,
  elderId: string
): Promise<VinculoCuidador[]> {
  const { data, error } = await supabase
    .from("vinculos_cuidador")
    .select("*")
    .eq("elder_id", elderId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`No se pudieron leer los cuidadores: ${error.message}`);
  return data as VinculoCuidador[];
}

/**
 * El elder revoca un vínculo propio (pendiente o ya aceptado). Filtra
 * también por `elder_id` además del `id` del vínculo — cinturón y
 * tirantes sobre la policy `vinculos_all_elder`, que ya exige lo mismo.
 */
export async function revocar(
  supabase: Cliente,
  elderId: string,
  vinculoId: string
): Promise<void> {
  const { error } = await supabase
    .from("vinculos_cuidador")
    .update({ estado: "revocado" })
    .eq("id", vinculoId)
    .eq("elder_id", elderId);

  if (error) throw new Error(`No se pudo revocar el vínculo: ${error.message}`);
}

/**
 * Dirección (b) — el cuidador inicia el vínculo ANTES de que el elder
 * tenga nada cargado: crea una fila placeholder (`elder_id null`) con un
 * código de 6 dígitos de vida corta (30 min, mucho más corto que los 7
 * días de `invitar()` — un código numérico es fuerza-bruteable si queda
 * abierto más tiempo; no hay infraestructura de rate-limit en este
 * proyecto, documentado como límite conocido en la migración 010, no como
 * olvido). Reintenta una vez ante una colisión de `codigo` (el índice
 * único parcial `idx_vinculo_codigo_pendiente` existe justo para
 * detectarla) — una colisión persistente después del reintento es una
 * anomalía real, no un resultado esperado: acá sí se lanza, mismo
 * criterio que el resto de los inserts de este archivo que no envuelven
 * una RPC `security definer`.
 *
 * `email_invitado` es `not null` a nivel de columna (no se tocó en la
 * migración 010, sigue siendo el shape de la dirección (a)) pero no tiene
 * sentido para esta dirección — se manda `""` explícito, nunca se lee de
 * vuelta para esta fila (ni `VinculoRow` ni ninguna pantalla de la
 * dirección (b) la muestran).
 *
 * `perfilPendienteId` (opcional, onboarding conversacional nuevo,
 * 012_perfiles_y_medicamentos_pendientes.sql) — si se pasa, el código
 * recién generado queda linkeado (`vinculo_id`) a ese perfil en borrador,
 * para que `reclamar_vinculo_como_elder()` migre sus
 * `medicamentos_pendientes` a `medicamentos` reales cuando la persona
 * cuidada lo reclame. El UPDATE se apoya en `perfiles_pendientes_all_propio`
 * (ya permite `cuidador_id = auth.uid()`, no hace falta policy nueva). Si
 * el UPDATE falla, se lanza (igual criterio que el resto de este archivo
 * para escritura plana sin RPC): un código generado pero desconectado de
 * su borrador dejaría medicamentos huérfanos, es una anomalía real, no un
 * resultado aceptable en silencio.
 */
export async function crearVinculoComoCuidador(
  supabase: Cliente,
  cuidadorId: string,
  perfilPendienteId?: string
): Promise<VinculoCuidador> {
  let vinculo: VinculoCuidador | null = null;

  for (let intento = 0; intento < 2; intento++) {
    const { data, error } = await supabase
      .from("vinculos_cuidador")
      .insert({
        cuidador_id: cuidadorId,
        elder_id: null,
        email_invitado: "",
        codigo: generarCodigo(),
        expira_at: new Date(Date.now() + MINUTOS_EXPIRACION_CODIGO * 60 * 1000).toISOString(),
      })
      .select()
      .single();

    if (!error) {
      vinculo = data as VinculoCuidador;
      break;
    }

    const esColisionDeCodigo = error.code === "23505"; // unique_violation
    if (!esColisionDeCodigo || intento === 1) {
      throw new Error(`No se pudo generar el código de vínculo: ${error.message}`);
    }
  }

  if (!vinculo) {
    // Inalcanzable (el loop siempre asigna `vinculo` o lanza) — solo para conformar a TS.
    throw new Error("No se pudo generar el código de vínculo.");
  }

  if (perfilPendienteId) {
    const { error: errorLink } = await supabase
      .from("perfiles_pendientes")
      .update({ vinculo_id: vinculo.id })
      .eq("id", perfilPendienteId)
      .eq("cuidador_id", cuidadorId);

    if (errorLink) {
      throw new Error(`No se pudo vincular el código al perfil: ${errorLink.message}`);
    }
  }

  return vinculo;
}

/**
 * Reclama, para el usuario autenticado (el elder), un vínculo que un
 * cuidador inició por código — envuelve la RPC `security definer`
 * `reclamar_vinculo_como_elder`, simétrica a `reclamarInvitacion` de acá
 * arriba (dirección a). Nunca deja escapar una excepción cruda de
 * Postgres/RPC: se atrapa acá siempre.
 */
export async function reclamarVinculoComoElder(
  supabase: Cliente,
  codigo: string
): Promise<ResultadoReclamoElder> {
  const { data, error } = await supabase.rpc("reclamar_vinculo_como_elder", {
    p_codigo: codigo,
  });

  if (error) {
    const motivo = error.message;
    if (motivo === "codigo_no_encontrado") {
      return { error: "codigo_no_encontrado", mensaje: "Este código no existe o ya fue usado." };
    }
    if (motivo === "codigo_expirado") {
      return { error: "codigo_expirado", mensaje: "Este código ya venció." };
    }
    if (motivo === "ya_vinculado") {
      return { error: "ya_vinculado", mensaje: "Ya estás vinculado con esa persona." };
    }
    return {
      error: "error_desconocido",
      mensaje: `No se pudo procesar el código: ${error.message}`,
    };
  }

  const fila = (data as { cuidador_id: string; nombre: string }[] | null)?.[0];
  if (!fila) {
    return { error: "error_desconocido", mensaje: "El código no devolvió datos del cuidador." };
  }

  return { cuidadorId: fila.cuidador_id, nombre: fila.nombre };
}

/**
 * Todos los vínculos donde el usuario autenticado es cuidador (`cuidador_id`),
 * en cualquier estado — a diferencia de `listarElders` (solo `aceptado`,
 * vía RPC, para el árbol `/cuidar/*`), esta es para que el propio cuidador
 * vea también sus códigos todavía pendientes (dirección b, con countdown
 * de expiración) en `/cuidar` y `/app/perfil`. Lectura directa a la tabla
 * (no una RPC): `vinculos_select_cuidador` (008_cuidadores.sql) ya permite
 * `cuidador_id = auth.uid()` sin restricción de estado.
 */
export async function listarVinculosIniciadosPorMi(
  supabase: Cliente,
  cuidadorId: string
): Promise<VinculoCuidador[]> {
  const { data, error } = await supabase
    .from("vinculos_cuidador")
    .select("*")
    .eq("cuidador_id", cuidadorId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`No se pudieron leer los vínculos iniciados: ${error.message}`);
  return data as VinculoCuidador[];
}

/**
 * Elders que el usuario autenticado cuida (vínculo `aceptado`) — envuelve
 * la RPC `listar_elders_vinculados()`, que ya resuelve internamente
 * `auth.uid()` y devuelve exactamente `(elder_id, nombre)`. `cuidadorId`
 * no se usa para armar la query (la RPC no acepta ese parámetro, por
 * diseño: nunca se puede pedir la lista de OTRA cuenta) — se mantiene en
 * la firma solo para calzar con la convención `(supabase, usuarioId, ...)`
 * del resto del dominio.
 */
export async function listarElders(
  supabase: Cliente,
  cuidadorId: string
): Promise<ElderVinculado[]> {
  void cuidadorId;

  const { data, error } = await supabase.rpc("listar_elders_vinculados");
  if (error) throw new Error(`No se pudieron leer los elders vinculados: ${error.message}`);

  return ((data ?? []) as { elder_id: string; nombre: string }[]).map((fila) => ({
    elderId: fila.elder_id,
    nombre: fila.nombre,
  }));
}

/**
 * Reclama una invitación pendiente para el usuario autenticado —
 * envuelve la RPC `security definer` `reclamar_invitacion_cuidador`.
 * Esa RPC puede tirar una excepción de Postgres (token inexistente,
 * expirado, o de otra cuenta) que acá se atrapa siempre: el código
 * llamador (Server Action de `/cuidar/invitacion/[token]`) nunca debe
 * ver una excepción cruda de la DB, solo este shape tipado.
 */
export async function reclamarInvitacion(
  supabase: Cliente,
  token: string
): Promise<ResultadoReclamo> {
  const { data, error } = await supabase.rpc("reclamar_invitacion_cuidador", {
    p_token: token,
  });

  if (error) {
    const codigo = error.message;
    if (codigo === "invitacion_no_encontrada") {
      return {
        error: "invitacion_no_encontrada",
        mensaje: "Esta invitación no existe, ya fue usada o fue revocada.",
      };
    }
    if (codigo === "invitacion_expirada") {
      return { error: "invitacion_expirada", mensaje: "Esta invitación ya venció." };
    }
    if (codigo === "invitacion_no_corresponde_a_esta_cuenta") {
      return {
        error: "invitacion_no_corresponde_a_esta_cuenta",
        mensaje: "Esta invitación fue enviada a otra cuenta de Google.",
      };
    }
    return {
      error: "error_desconocido",
      mensaje: `No se pudo reclamar la invitación: ${error.message}`,
    };
  }

  const fila = (data as { elder_id: string; nombre: string }[] | null)?.[0];
  if (!fila) {
    return { error: "error_desconocido", mensaje: "La invitación no devolvió datos del elder." };
  }

  return { elderId: fila.elder_id, nombre: fila.nombre };
}

const GRACIA_MIN_POPUP = 30; // mismo margen que el resto del dominio (notificaciones/nucleo.ts, modo-simple) — repetido a propósito, ver esos archivos.

/**
 * Dosis de hoy, ya vencidas (sin confirmar más allá del margen de
 * gracia), de todos los elders vinculados a este cuidador — para el
 * popup de alerta dentro de la app (pedido explícito del usuario: por
 * ahora sin email, solo un aviso visible al entrar a /cuidar). Reutiliza
 * `listarHoy`/`esDosisVencida`/`horaEnAR` sin cambios — la RLS aditiva de
 * 008_cuidadores.sql ya resuelve qué filas puede leer este cuidador, así
 * que un `listarHoy(supabase, elder.elderId)` por cada elder alcanza, sin
 * necesitar el cliente `service_role` que sí usa el cron (ver
 * notificaciones/nucleo.ts) — acá no se cruza a usuarios sin vínculo.
 */
export async function listarDosisVencidasDeMisElders(
  supabase: Cliente,
  elders: ElderVinculado[],
  graciaMin: number = GRACIA_MIN_POPUP
): Promise<DosisVencidaCuidador[]> {
  const ahoraAR = horaEnAR();
  const resultados: DosisVencidaCuidador[] = [];

  for (const elder of elders) {
    const hoy = await listarHoy(supabase, elder.elderId);
    for (const m of hoy) {
      if (!m.tomado && esDosisVencida(m.hora_programada, ahoraAR, graciaMin)) {
        resultados.push({
          elderId: elder.elderId,
          elderNombre: elder.nombre,
          medicamentoId: m.id,
          nombre: m.nombre,
          dosis: m.dosis,
          unidad: m.unidad,
          horaProgramada: m.hora_programada,
        });
      }
    }
  }

  return resultados;
}
