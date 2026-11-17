import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Admin } from "../acceso";
import { listarAdministradores } from "../administradores";
import type { Asignacion, Bug, Caso, Prueba, Reporte } from "./logica";

// Lectura del módulo Testing. Cada función recibe el `Admin` de `requireAdmin()` (prueba de sesión + segundo factor) y recién
// entonces crea el cliente `service_role`: las tablas `track_*` no tienen policies, no hay otra puerta. Nunca lanza: null =
// no se pudo leer (migración 063 sin aplicar, base caída). No hay datos de usuarios de vita acá, solo lo que cargan los admins.

export const BUCKET_ADJUNTOS = "track-adjuntos";
const PAGINA = 1000;
const TOPE_FILAS = 20_000;

type Consulta = (desde: number, hasta: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>;

/** PostgREST corta en 1000 filas por request: se pide de a páginas hasta agotar (con tope). */
async function todas<T>(consulta: Consulta): Promise<T[] | null> {
  const filas: T[] = [];
  for (let desde = 0; desde < TOPE_FILAS; desde += PAGINA) {
    const { data, error } = await consulta(desde, desde + PAGINA - 1);
    if (error || !data) return null;
    filas.push(...(data as T[]));
    if (data.length < PAGINA) break;
  }
  return filas;
}

async function seguro<T>(admin: Admin, fn: (db: ReturnType<typeof createAdminClient>) => Promise<T | null>): Promise<T | null> {
  void admin;
  try {
    return await fn(createAdminClient());
  } catch {
    console.error("track testing: no se pudo leer");
    return null;
  }
}

export type Persona = { email: string; rol: "dueno" | "admin" };

/** Las personas del equipo = quienes pueden entrar al panel (dueños de ADMIN_EMAILS + administradores activos). */
export async function listarPersonas(admin: Admin): Promise<Persona[]> {
  const l = await listarAdministradores(admin);
  const mapa = new Map<string, Persona>();
  for (const f of [...l.duenos, ...l.administradores]) mapa.set(f.email, { email: f.email, rol: f.rol });
  mapa.set(admin.email, mapa.get(admin.email) ?? { email: admin.email, rol: admin.rol });
  return [...mapa.values()].sort((a, b) => a.email.localeCompare(b.email));
}

export async function esPersonaDelEquipo(admin: Admin, email: string): Promise<boolean> {
  return (await listarPersonas(admin)).some((p) => p.email === email);
}

export type DatosTesting = { casos: Caso[]; pruebas: Prueba[]; bugs: Bug[]; reportes: Reporte[] };

export async function cargarTesting(admin: Admin): Promise<DatosTesting | null> {
  return seguro(admin, async (db) => {
    const [casos, pruebas, bugs, reportes] = await Promise.all([
      todas<Caso>((d, h) => db.from("track_casos").select("*").order("posicion").order("id").range(d, h)),
      todas<Prueba>((d, h) => db.from("track_pruebas").select("*").order("id", { ascending: false }).range(d, h)),
      todas<Bug>((d, h) => db.from("track_bugs").select("*").order("id", { ascending: false }).range(d, h)),
      todas<Reporte>((d, h) => db.from("track_reportes").select("*").order("id", { ascending: false }).range(d, h)),
    ]);
    if (!casos || !pruebas || !bugs || !reportes) return null;
    return { casos, pruebas, bugs, reportes };
  });
}

export type Ronda = {
  id: number;
  nombre: string;
  version_app: string;
  desde: string;
  hasta: string | null;
  estado: "activa" | "cerrada";
  notas: string;
  creada_por: string;
  created_at: string;
};

export async function listarRondas(admin: Admin): Promise<Ronda[] | null> {
  return seguro(admin, async (db) => {
    const { data, error } = await db.from("track_rondas").select("*").order("id", { ascending: false }).limit(200);
    return error || !data ? null : (data as Ronda[]);
  });
}

export async function listarAsignaciones(admin: Admin): Promise<Asignacion[] | null> {
  return seguro(admin, (db) => todas<Asignacion>((d, h) => db.from("track_asignaciones").select("*").order("id").range(d, h)));
}

export type DetalleRonda = { ronda: Ronda; asignaciones: Asignacion[]; pruebas: Prueba[]; casos: Caso[] };

export async function leerRonda(admin: Admin, id: number): Promise<DetalleRonda | null | "no_existe"> {
  return seguro<DetalleRonda | "no_existe">(admin, async (db) => {
    const r = await db.from("track_rondas").select("*").eq("id", id).maybeSingle();
    if (r.error) return null;
    if (!r.data) return "no_existe";
    const [asignaciones, pruebas, casos] = await Promise.all([
      todas<Asignacion>((d, h) => db.from("track_asignaciones").select("*").eq("ronda_id", id).order("id").range(d, h)),
      todas<Prueba>((d, h) => db.from("track_pruebas").select("*").eq("ronda_id", id).order("id", { ascending: false }).range(d, h)),
      todas<Caso>((d, h) => db.from("track_casos").select("*").order("posicion").order("id").range(d, h)),
    ]);
    if (!asignaciones || !pruebas || !casos) return null;
    return { ronda: r.data as Ronda, asignaciones, pruebas, casos };
  });
}

export type MiAsignacion = { asignacion: Asignacion; ronda: Ronda; caso: Caso; ultima: Prueba | null };

/** Lo que le toca al admin logueado en las rondas activas. */
export async function misAsignaciones(admin: Admin): Promise<MiAsignacion[] | null> {
  return seguro(admin, async (db) => {
    const { data, error } = await db.from("track_asignaciones").select("*").eq("admin_email", admin.email).order("id").limit(2000);
    if (error || !data) return null;
    const asignaciones = data as Asignacion[];
    if (asignaciones.length === 0) return [];
    const rondaIds = [...new Set(asignaciones.map((a) => a.ronda_id))];
    const casoIds = [...new Set(asignaciones.map((a) => a.caso_id))];
    const [rondas, casos, pruebas] = await Promise.all([
      db.from("track_rondas").select("*").in("id", rondaIds).eq("estado", "activa"),
      db.from("track_casos").select("*").in("id", casoIds),
      todas<Prueba>((d, h) =>
        db.from("track_pruebas").select("*").in("asignacion_id", asignaciones.map((a) => a.id)).order("id", { ascending: false }).range(d, h),
      ),
    ]);
    if (rondas.error || casos.error || !pruebas) return null;
    const rondaPorId = new Map((rondas.data as Ronda[]).map((r) => [r.id, r]));
    const casoPorId = new Map((casos.data as Caso[]).map((c) => [c.id, c]));
    const ultima = new Map<number, Prueba>();
    for (const p of pruebas) if (p.asignacion_id !== null && !ultima.has(p.asignacion_id)) ultima.set(p.asignacion_id, p);
    const out: MiAsignacion[] = [];
    for (const a of asignaciones) {
      const ronda = rondaPorId.get(a.ronda_id);
      const caso = casoPorId.get(a.caso_id);
      if (ronda && caso) out.push({ asignacion: a, ronda, caso, ultima: ultima.get(a.id) ?? null });
    }
    return out;
  });
}

export type Adjunto = {
  id: number;
  nombre: string;
  mime: string;
  tamano_bytes: number;
  subido_por: string;
  created_at: string;
  /** URL firmada de 1 hora (el bucket es privado); null si no se pudo firmar. */
  url: string | null;
};

type FilaAdjunto = Omit<Adjunto, "url"> & { ruta: string };

async function conUrls(db: ReturnType<typeof createAdminClient>, filas: FilaAdjunto[]): Promise<Adjunto[]> {
  if (filas.length === 0) return [];
  const { data } = await db.storage.from(BUCKET_ADJUNTOS).createSignedUrls(
    filas.map((f) => f.ruta),
    3600,
  );
  const urls = new Map<string, string>();
  for (const d of data ?? []) if (d.path && d.signedUrl) urls.set(d.path, d.signedUrl);
  return filas.map(({ ruta, ...resto }) => ({ ...resto, url: urls.get(ruta) ?? null }));
}

export type EventoBug = {
  id: number;
  actor_email: string;
  accion: "creado" | "cambio" | "comentario";
  campo: string | null;
  valor_anterior: string | null;
  valor_nuevo: string | null;
  cuerpo: string;
  created_at: string;
};

export type DetalleBug = { bug: Bug; caso: Caso | null; eventos: EventoBug[]; adjuntos: Adjunto[]; reportes: Reporte[]; pruebas: Prueba[] };

export async function leerBug(admin: Admin, id: number): Promise<DetalleBug | null | "no_existe"> {
  return seguro<DetalleBug | "no_existe">(admin, async (db) => {
    const b = await db.from("track_bugs").select("*").eq("id", id).maybeSingle();
    if (b.error) return null;
    if (!b.data) return "no_existe";
    const bug = b.data as Bug;
    const [caso, eventos, adjuntos, reportes, pruebas] = await Promise.all([
      bug.caso_id === null ? Promise.resolve({ data: null, error: null }) : db.from("track_casos").select("*").eq("id", bug.caso_id).maybeSingle(),
      db.from("track_bug_eventos").select("*").eq("bug_id", id).order("created_at").order("id").limit(500),
      db.from("track_adjuntos").select("id, nombre, mime, tamano_bytes, subido_por, created_at, ruta").eq("bug_id", id).order("id"),
      db.from("track_reportes").select("*").eq("bug_id", id).order("id"),
      db.from("track_pruebas").select("*").eq("bug_id", id).order("id"),
    ]);
    if (caso.error || eventos.error || adjuntos.error || reportes.error || pruebas.error) return null;
    return {
      bug,
      caso: (caso.data as Caso | null) ?? null,
      eventos: (eventos.data ?? []) as EventoBug[],
      adjuntos: await conUrls(db, (adjuntos.data ?? []) as FilaAdjunto[]),
      reportes: (reportes.data ?? []) as Reporte[],
      pruebas: (pruebas.data ?? []) as Prueba[],
    };
  });
}

export type DetalleCaso = { caso: Caso; pruebas: Prueba[]; bugs: Bug[]; adjuntos: Record<number, Adjunto[]> };

export async function leerCaso(admin: Admin, id: number): Promise<DetalleCaso | null | "no_existe"> {
  return seguro<DetalleCaso | "no_existe">(admin, async (db) => {
    const c = await db.from("track_casos").select("*").eq("id", id).maybeSingle();
    if (c.error) return null;
    if (!c.data) return "no_existe";
    const [pruebas, bugs] = await Promise.all([
      db.from("track_pruebas").select("*").eq("caso_id", id).order("id", { ascending: false }).limit(200),
      db.from("track_bugs").select("*").eq("caso_id", id).order("id", { ascending: false }).limit(200),
    ]);
    if (pruebas.error || bugs.error) return null;
    const lista = (pruebas.data ?? []) as Prueba[];
    const adj = lista.length
      ? await db.from("track_adjuntos").select("id, prueba_id, nombre, mime, tamano_bytes, subido_por, created_at, ruta").in("prueba_id", lista.map((p) => p.id))
      : { data: [], error: null };
    if (adj.error) return null;
    const filas = (adj.data ?? []) as (FilaAdjunto & { prueba_id: number })[];
    const firmados = await conUrls(db, filas);
    const porPrueba: Record<number, Adjunto[]> = {};
    filas.forEach((f, i) => {
      (porPrueba[f.prueba_id] ??= []).push(firmados[i]);
    });
    return { caso: c.data as Caso, pruebas: lista, bugs: (bugs.data ?? []) as Bug[], adjuntos: porPrueba };
  });
}

export type DetalleReporte = { reporte: Reporte; adjuntos: Adjunto[]; bug: Bug | null };

export async function leerReporte(admin: Admin, id: number): Promise<DetalleReporte | null | "no_existe"> {
  return seguro<DetalleReporte | "no_existe">(admin, async (db) => {
    const r = await db.from("track_reportes").select("*").eq("id", id).maybeSingle();
    if (r.error) return null;
    if (!r.data) return "no_existe";
    const reporte = r.data as Reporte;
    const [adj, bug] = await Promise.all([
      db.from("track_adjuntos").select("id, nombre, mime, tamano_bytes, subido_por, created_at, ruta").eq("reporte_id", id).order("id"),
      reporte.bug_id === null ? Promise.resolve({ data: null, error: null }) : db.from("track_bugs").select("*").eq("id", reporte.bug_id).maybeSingle(),
    ]);
    if (adj.error || bug.error) return null;
    return { reporte, adjuntos: await conUrls(db, (adj.data ?? []) as FilaAdjunto[]), bug: (bug.data as Bug | null) ?? null };
  });
}

/** Adjuntos de las pruebas de una asignación (para "Mis pruebas"): no se cargan, solo se cuentan arriba. */
export async function cantidadAdjuntosDePruebas(admin: Admin, pruebaIds: number[]): Promise<Record<number, number>> {
  const out: Record<number, number> = {};
  if (pruebaIds.length === 0) return out;
  await seguro(admin, async (db) => {
    const { data } = await db.from("track_adjuntos").select("prueba_id").in("prueba_id", pruebaIds);
    for (const f of (data ?? []) as { prueba_id: number }[]) out[f.prueba_id] = (out[f.prueba_id] ?? 0) + 1;
    return true;
  });
  return out;
}
