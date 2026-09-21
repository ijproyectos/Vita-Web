import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ElderVinculado, ResultadoReclamo, VinculoCuidador } from "./tipos";

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
