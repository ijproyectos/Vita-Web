import "server-only";

import { generarCodigo, hashCodigo, estadoCodigo, normalizarCodigo, ultimos4, type EntradaAltaCodigos, type EstadoCodigo, type TipoCodigo } from "@/lib/vita-plus/codigos";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Admin } from "./acceso";
import { registrarAccionAdmin } from "./auditoria";

// Códigos de vita+ desde el panel. Cada función recibe el `Admin` que devolvió `requireAdmin()` (el tipo es la
// prueba de que ya se validó sesión + segundo factor) y solo entonces crea el cliente `service_role`. Nunca lanza.

export type FilaCodigo = {
  id: string;
  tipo: TipoCodigo;
  ultimos4: string;
  usos: number;
  usosMax: number;
  venceCodigoAt: string | null;
  revocadoAt: string | null;
  creadoPor: string;
  creado: string;
  estado: EstadoCodigo;
};

type FilaDb = {
  id: string;
  tipo: string;
  ultimos4: string;
  usos: number;
  usos_max: number;
  vence_codigo_at: string | null;
  revocado_at: string | null;
  creado_por_email: string;
  created_at: string;
};

export async function listarCodigos(admin: Admin): Promise<FilaCodigo[] | null> {
  void admin; // el tipo es la prueba de que ya pasó requireAdmin()
  try {
    const { data, error } = await createAdminClient()
      .from("vita_plus_codigos")
      .select("id, tipo, ultimos4, usos, usos_max, vence_codigo_at, revocado_at, creado_por_email, created_at")
      .order("created_at", { ascending: false })
      .limit(300);
    if (error || !data) return null;
    const ahora = Date.now();
    return (data as FilaDb[]).map((f) => ({
      id: f.id,
      tipo: f.tipo === "admin" ? "admin" : "plus",
      ultimos4: f.ultimos4,
      usos: f.usos,
      usosMax: f.usos_max,
      venceCodigoAt: f.vence_codigo_at,
      revocadoAt: f.revocado_at,
      creadoPor: f.creado_por_email,
      creado: f.created_at,
      estado: estadoCodigo({ revocadoAt: f.revocado_at, usos: f.usos, usosMax: f.usos_max, venceCodigoAt: f.vence_codigo_at }, ahora),
    }));
  } catch {
    return null;
  }
}

export type ResultadoAlta = { ok: true; codigos: string[]; aviso?: string } | { ok: false; mensaje: string };

export async function crearCodigos(admin: Admin, datos: EntradaAltaCodigos): Promise<ResultadoAlta> {
  try {
    const cliente = createAdminClient();
    const codigos: string[] = [];
    const ids: string[] = [];
    let falloTotal = false;
    for (let i = 0; i < datos.cantidad; i++) {
      let creado = false;
      for (let intento = 0; intento < 3 && !creado; intento++) {
        const codigo = generarCodigo();
        const normalizado = normalizarCodigo(codigo);
        const { data, error } = await cliente.rpc("crear_codigo_vita_plus", {
          p_tipo: datos.tipo,
          p_usos_max: datos.usosMax,
          p_vence: datos.venceCodigoAt,
          p_hash: hashCodigo(normalizado),
          p_ultimos4: ultimos4(normalizado),
          p_creado_por: admin.email,
        });
        const fila = (Array.isArray(data) ? data[0] : data) as { cr_id?: unknown; cr_resultado?: unknown } | null;
        if (error || !fila) {
          falloTotal = true;
          break;
        }
        if (fila.cr_resultado === "ok" && typeof fila.cr_id === "string") {
          codigos.push(codigo);
          ids.push(fila.cr_id);
          creado = true;
        } else if (fila.cr_resultado !== "duplicado") {
          falloTotal = true;
          break;
        }
      }
      if (!creado) break;
    }
    if (codigos.length === 0) {
      return { ok: false, mensaje: falloTotal ? "No pudimos crear los códigos. Revisá que la migración 046 esté aplicada." : "No pudimos generar un código único. Probá de nuevo." };
    }
    await registrarAccionAdmin(admin.email, "codigo_creado", ids[0] ?? null, {
      tipo: datos.tipo,
      cantidad: codigos.length,
      usos_max: datos.usosMax,
      vence: datos.venceCodigoAt,
    });
    return {
      ok: true,
      codigos,
      aviso: codigos.length < datos.cantidad ? `Se crearon ${codigos.length} de ${datos.cantidad} códigos.` : undefined,
    };
  } catch {
    return { ok: false, mensaje: "No pudimos crear los códigos. Probá de nuevo." };
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function revocarCodigo(admin: Admin, id: string): Promise<{ ok: true } | { ok: false; mensaje: string }> {
  if (!UUID.test(id)) return { ok: false, mensaje: "Código inválido." };
  try {
    const { data, error } = await createAdminClient().rpc("revocar_codigo_vita_plus", { p_id: id });
    if (error) return { ok: false, mensaje: "No pudimos revocar el código. Probá de nuevo." };
    if (data !== true) return { ok: false, mensaje: "El código ya estaba revocado o no existe." };
    await registrarAccionAdmin(admin.email, "codigo_revocado", id, {});
    return { ok: true };
  } catch {
    return { ok: false, mensaje: "No pudimos revocar el código. Probá de nuevo." };
  }
}
