import "server-only";

import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { avisarPersonaEnVita } from "@/lib/notificaciones/familia";
import { generarCodigo, reclamarVinculoComoElder } from "@/lib/cuidadores/nucleo";
import {
  DOMINIO_CUENTA_POR_CODIGO,
  MINUTOS_VIGENCIA_CODIGO_ACCESO,
  type ResultadoCodigoAcceso,
  type ResultadoVerCodigo,
  type VistaPreviaCodigo,
  type ResultadoEntrarConCodigo,
} from "./tipos";

// Acceso por código, sin cuenta de Google (ver migración 019 y CLAUDE.md).
//
// USO ADMIN SANCIONADO: este módulo usa el cliente service_role porque
// quien entra por código NO tiene sesión todavía — ninguna policy RLS puede
// resolver "¿este código es válido?" para un anónimo. Es la única vía de
// request de usuario (no cron) autorizada a importar lib/supabase/admin.ts,
// y solo se invoca desde dos Server Actions, siempre DESPUÉS del throttling
// por IP (`intentos_codigo`): `entrarConCodigoAction` (login) y
// `verCodigoAction` (vista previa "¿Sos vos?", también alcanzable desde
// /onboarding/inicio). La vista previa es de solo lectura: nunca consume el
// código, devuelve únicamente el primer nombre de la persona, el primer
// nombre de quien la cuida y la cantidad de medicamentos, y replica los
// chequeos del login (código vigente y vínculo emisor aún aceptado), así que
// no expone nada que no se vea igual sin sesión. Nunca loguear códigos ni emails.
type Cliente = SupabaseClient;

const VENTANA_MIN = 15;
const MAX_INTENTOS = 10;
const MAX_CODIGOS_CANDIDATOS = 500;

// --- throttling -----------------------------------------------------------

function secretoIp(): string {
  // CRON_SECRET hoy no está cargado en producción (el cron de email está
  // apagado), así que la clave por defecto es la service role key, que
  // siempre existe y nunca sale del servidor. Se puede fijar una dedicada
  // con CODIGOS_IP_SECRET.
  return process.env.CODIGOS_IP_SECRET ?? process.env.CRON_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
}

/** IP del cliente hasheada (HMAC-SHA256) — nunca se guarda la IP cruda. */
export function hashIp(ip: string): string {
  return createHmac("sha256", secretoIp()).update(ip).digest("hex");
}

/**
 * Registra el intento y devuelve true si esa IP ya superó el máximo en la
 * ventana. Se inserta ANTES de contar para que ráfagas concurrentes se
 * cuenten entre sí. Falla cerrado: ante cualquier error de la DB, bloquea.
 */
async function registrarIntentoYVerificarBloqueo(admin: Cliente, ipHash: string): Promise<boolean> {
  const { error: errorInsert } = await admin.from("intentos_codigo").insert({ ip_hash: ipHash });
  if (errorInsert) return true;

  const desde = new Date(Date.now() - VENTANA_MIN * 60 * 1000).toISOString();
  const { count, error } = await admin
    .from("intentos_codigo")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("creado_at", desde);
  if (error || count === null) return true;
  return count > MAX_INTENTOS;
}

/** Limpieza oportunista (5% de las llamadas): intentos y códigos viejos. */
async function limpiarVencidos(admin: Cliente): Promise<void> {
  if (Math.random() >= 0.05) return;
  const hace1Dia = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  await admin.from("intentos_codigo").delete().lt("creado_at", hace1Dia);
  await admin.from("codigos_acceso").delete().lt("expira_at", hace1Dia);
}

// --- códigos de acceso (re-ingreso) ----------------------------------------

function hashCodigoAcceso(salt: string, codigo: string): string {
  return createHash("sha256").update(salt + codigo).digest("hex");
}

function igualesEnTiempoConstante(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * El cuidador (sesión normal, RLS) genera un código de re-ingreso de un solo
 * uso para un elder con el que tiene vínculo aceptado. La policy
 * `codigos_acceso_insert_cuidador` es la autoridad: si el vínculo no existe,
 * el insert falla. Devuelve el código en claro SOLO acá (en DB queda el hash).
 */
export async function generarCodigoAcceso(
  supabase: Cliente,
  cuidadorId: string,
  elderId: string
): Promise<ResultadoCodigoAcceso> {
  const codigo = generarCodigo();
  const salt = randomBytes(16).toString("hex");
  const expiraAt = new Date(Date.now() + MINUTOS_VIGENCIA_CODIGO_ACCESO * 60 * 1000).toISOString();

  const { error } = await supabase.from("codigos_acceso").insert({
    elder_id: elderId,
    cuidador_id: cuidadorId,
    codigo_hash: hashCodigoAcceso(salt, codigo),
    salt,
    expira_at: expiraAt,
  });
  if (error) return { status: "error", message: "No pudimos generar el código. Probá de nuevo." };
  return { status: "success", codigo, expiraAt };
}

// --- sesión ------------------------------------------------------------------

/**
 * Abre sesión en ESTE navegador para el email dado: el admin genera un link
 * mágico (solo se usa su `hashed_token`, nunca se envía por mail) y el cliente
 * de servidor lo canjea con `verifyOtp({ type: "magiclink", token_hash })`,
 * que setea las cookies de sesión vía el adaptador de @supabase/ssr.
 */
async function abrirSesion(admin: Cliente, supabase: Cliente, email: string): Promise<string | null> {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) return null;

  const { data: sesion, error: errorOtp } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
  if (errorOtp || !sesion?.user) return null;
  return sesion.user.id;
}

// --- primer acceso (código de vínculo) --------------------------------------

type VinculoValido = { id: string; cuidadorId: string };

async function buscarVinculoPendiente(admin: Cliente, codigo: string): Promise<VinculoValido | null> {
  const { data } = await admin
    .from("vinculos_cuidador")
    .select("id, cuidador_id")
    .eq("codigo", codigo)
    .eq("estado", "pendiente")
    .is("elder_id", null)
    .not("cuidador_id", "is", null)
    .gt("expira_at", new Date().toISOString())
    .maybeSingle();
  if (!data) return null;
  return { id: data.id as string, cuidadorId: data.cuidador_id as string };
}

async function entrarConCodigoDeVinculo(
  admin: Cliente,
  supabase: Cliente,
  codigo: string,
  vinculo: VinculoValido
): Promise<ResultadoEntrarConCodigo> {
  // Nombre del borrador que armó el cuidador (si lo hay), para el perfil.
  const { data: borrador } = await admin
    .from("perfiles_pendientes")
    .select("nombre")
    .eq("vinculo_id", vinculo.id)
    .eq("estado", "borrador")
    .maybeSingle();
  const nombre = (borrador?.nombre as string | undefined) ?? null;

  // Cuenta real con email placeholder no entregable y contraseña aleatoria
  // que nadie ve ni se guarda: la sesión se abre por link mágico, no por password.
  const email = `cuidado-${randomUUID()}@${DOMINIO_CUENTA_POR_CODIGO}`;
  const { data: creado, error: errorCrear } = await admin.auth.admin.createUser({
    email,
    password: randomBytes(32).toString("base64url"),
    email_confirm: true,
    user_metadata: { tipo: "cuenta_por_codigo" },
  });
  if (errorCrear || !creado.user) return { ok: false, motivo: "error" };
  const userId = creado.user.id;

  const limpiar = async () => {
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    await admin.auth.admin.deleteUser(userId).catch(() => undefined);
  };

  try {
    const idSesion = await abrirSesion(admin, supabase, email);
    if (idSesion !== userId) {
      await limpiar();
      return { ok: false, motivo: "error" };
    }

    // Perfil listo ANTES del reclamo: así no queda ningún paso que pueda
    // fallar después de consumir el vínculo (el cleanup por cascada se
    // llevaría el vínculo y los medicamentos migrados).
    const { error: errorPerfil } = await admin.from("perfiles").upsert(
      { id: userId, nombre, uso_app: "yo", onboarding_completado_at: new Date().toISOString() },
      { onConflict: "id" }
    );
    if (errorPerfil) {
      await limpiar();
      return { ok: false, motivo: "error" };
    }

    // Misma RPC que el flujo con Google: valida código y expiración, migra
    // el borrador de perfil/medicamentos y vincula. Corre con la sesión
    // recién abierta (auth.uid() = la cuenta nueva).
    const reclamo = await reclamarVinculoComoElder(supabase, codigo);
    if ("error" in reclamo) {
      await limpiar();
      return { ok: false, motivo: reclamo.error === "error_desconocido" ? "error" : "invalido" };
    }
    return { ok: true };
  } catch {
    await limpiar();
    return { ok: false, motivo: "error" };
  }
}

// --- re-acceso (código de acceso) -------------------------------------------

type CodigoAccesoValido = { id: string; elder_id: string; cuidador_id: string };

/**
 * Busca el código de acceso vigente (sin usar, sin vencer) que coincide con
 * `codigo`. Compartido por el login y la vista previa. Se recorren TODOS los
 * candidatos (sin cortar en el primer match) para no filtrar por tiempo cuál
 * posición coincidió.
 */
async function buscarCodigoAcceso(admin: Cliente, codigo: string): Promise<CodigoAccesoValido | null> {
  const { data: candidatos } = await admin
    .from("codigos_acceso")
    .select("id, elder_id, cuidador_id, codigo_hash, salt")
    .is("usado_at", null)
    .gt("expira_at", new Date().toISOString())
    .limit(MAX_CODIGOS_CANDIDATOS);

  let match: CodigoAccesoValido | null = null;
  for (const c of candidatos ?? []) {
    const coincide = igualesEnTiempoConstante(hashCodigoAcceso(c.salt as string, codigo), c.codigo_hash as string);
    if (coincide && !match) {
      match = { id: c.id as string, elder_id: c.elder_id as string, cuidador_id: c.cuidador_id as string };
    }
  }
  return match;
}

/** El cuidador que emitió el código tiene que seguir vinculado (no revocado). */
async function vinculoAceptado(admin: Cliente, elderId: string, cuidadorId: string): Promise<boolean> {
  const { data } = await admin
    .from("vinculos_cuidador")
    .select("id")
    .eq("elder_id", elderId)
    .eq("cuidador_id", cuidadorId)
    .eq("estado", "aceptado")
    .maybeSingle();
  return !!data;
}

async function entrarConCodigoDeAcceso(
  admin: Cliente,
  supabase: Cliente,
  codigo: string
): Promise<ResultadoEntrarConCodigo> {
  const match = await buscarCodigoAcceso(admin, codigo);
  if (!match) return { ok: false, motivo: "invalido" };

  // Consumo atómico: solo una request puede pasar de usado_at null a now().
  const { data: consumido } = await admin
    .from("codigos_acceso")
    .update({ usado_at: new Date().toISOString() })
    .eq("id", match.id)
    .is("usado_at", null)
    .select("id");
  if (!consumido || consumido.length === 0) return { ok: false, motivo: "invalido" };

  const devolver = async () => {
    await admin.from("codigos_acceso").update({ usado_at: null }).eq("id", match!.id);
  };

  // El cuidador que lo emitió tiene que seguir vinculado (no revocado).
  if (!(await vinculoAceptado(admin, match.elder_id, match.cuidador_id))) return { ok: false, motivo: "invalido" };

  const { data: elder, error: errorElder } = await admin.auth.admin.getUserById(match.elder_id);
  const email = elder?.user?.email;
  if (errorElder || !email) {
    await devolver();
    return { ok: false, motivo: "error" };
  }

  // Primera vez de un perfil gestionado: nunca inició sesión. Se mira ANTES de
  // abrir la sesión (que actualiza last_sign_in_at).
  const primeraVez =
    !elder?.user?.last_sign_in_at && (elder?.user?.app_metadata as { tipo?: string } | null)?.tipo === "perfil_gestionado";

  const idSesion = await abrirSesion(admin, supabase, email);
  if (idSesion !== match.elder_id) {
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    await devolver();
    return { ok: false, motivo: "error" };
  }
  // "Elsa ya está en vita" para sus cuidadores Admin (feed + push). Nunca lanza
  // ni rompe el ingreso: es secundario (se espera para que la función serverless no corte el envío).
  if (primeraVez) await avisarPersonaEnVita(admin, match.elder_id);
  return { ok: true };
}

// --- entrada pública ----------------------------------------------------------

/**
 * Canjea un código de 6 dígitos desde /login (sin sesión previa): primero
 * como código de vínculo (primer acceso), si no existe como código de acceso
 * (re-ingreso). `ip` solo se usa para el throttling (se hashea). Nunca lanza.
 */
export async function entrarConCodigo(
  supabase: Cliente,
  codigo: string,
  ip: string
): Promise<ResultadoEntrarConCodigo> {
  try {
    const admin = createAdminClient();

    const bloqueado = await registrarIntentoYVerificarBloqueo(admin, hashIp(ip));
    void limpiarVencidos(admin).catch(() => undefined);
    if (bloqueado) return { ok: false, motivo: "bloqueado" };

    const vinculo = await buscarVinculoPendiente(admin, codigo);
    if (vinculo) return await entrarConCodigoDeVinculo(admin, supabase, codigo, vinculo);

    return await entrarConCodigoDeAcceso(admin, supabase, codigo);
  } catch {
    console.error("[acceso-codigo] error inesperado al entrar con código");
    return { ok: false, motivo: "error" };
  }
}

// --- vista previa ("¿Sos vos?") ---------------------------------------------

function primerNombre(nombre: string | null | undefined): string | null {
  const n = nombre?.trim().split(/\s+/)[0];
  return n ? n : null;
}

async function nombreDePerfil(admin: Cliente, id: string): Promise<string | null> {
  const { data } = await admin.from("perfiles").select("nombre").eq("id", id).maybeSingle();
  return (data?.nombre as string | null | undefined)?.trim() || null;
}

/**
 * Mira a quién pertenece un código VÁLIDO (sin vencer y sin usar) sin
 * consumirlo, para mostrar "Hola, Elsa. Mica ya armó tu perfil" antes de
 * reclamarlo. Solo expone el nombre de la persona, el primer nombre de quien
 * la cuida y cuántos medicamentos hay cargados — nada más. Comparte el
 * throttling por IP con `entrarConCodigo` (cada vista previa cuenta como un
 * intento), así que no sirve para enumerar códigos. Un código inexistente,
 * vencido o usado da el mismo `invalido`. Nunca lanza.
 */
export async function verCodigo(codigo: string, ip: string): Promise<ResultadoVerCodigo> {
  try {
    const admin = createAdminClient();
    const bloqueado = await registrarIntentoYVerificarBloqueo(admin, hashIp(ip));
    if (bloqueado) return { ok: false, motivo: "bloqueado" };

    // 1) Código de vínculo (primer acceso): el cuidador armó un borrador.
    const vinculo = await buscarVinculoPendiente(admin, codigo);
    if (vinculo) {
      const { data: borrador } = await admin
        .from("perfiles_pendientes")
        .select("id, nombre")
        .eq("vinculo_id", vinculo.id)
        .eq("estado", "borrador")
        .maybeSingle();
      const nombreCompleto = (borrador?.nombre as string | undefined)?.trim();
      // Sin borrador no hay a quién mostrar: se sigue por el camino directo.
      if (!borrador || !nombreCompleto) return { ok: false, motivo: "error" };
      const { count } = await admin
        .from("medicamentos_pendientes")
        .select("id", { count: "exact", head: true })
        .eq("perfil_pendiente_id", borrador.id as string);
      const vista: VistaPreviaCodigo = {
        nombreCompleto,
        nombre: primerNombre(nombreCompleto) ?? nombreCompleto,
        cuidador: primerNombre(await nombreDePerfil(admin, vinculo.cuidadorId)),
        medicamentos: count ?? null,
      };
      return { ok: true, vista };
    }

    // 2) Código de acceso (re-ingreso), sin consumirlo.
    const match = await buscarCodigoAcceso(admin, codigo);
    if (!match) return { ok: false, motivo: "invalido" };

    // Igual que el login: el cuidador emisor tiene que seguir vinculado.
    if (!(await vinculoAceptado(admin, match.elder_id, match.cuidador_id))) return { ok: false, motivo: "invalido" };

    const nombreCompleto = await nombreDePerfil(admin, match.elder_id);
    if (!nombreCompleto) return { ok: false, motivo: "error" };
    return {
      ok: true,
      vista: {
        nombreCompleto,
        nombre: primerNombre(nombreCompleto) ?? nombreCompleto,
        cuidador: primerNombre(await nombreDePerfil(admin, match.cuidador_id)),
        medicamentos: null,
      },
    };
  } catch {
    console.error("[acceso-codigo] error inesperado al ver el código");
    return { ok: false, motivo: "error" };
  }
}
