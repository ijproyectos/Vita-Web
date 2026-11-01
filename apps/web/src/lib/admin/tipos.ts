// Tipos y lectores de las respuestas de las funciones admin_* (migración 045). Módulo puro.
// Las RPC devuelven jsonb sin tipo: cada lector valida y normaliza, nunca confía en la forma.

type Obj = Record<string, unknown>;

export const obj = (v: unknown): Obj => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Obj) : {});
export const lista = (v: unknown): Obj[] => (Array.isArray(v) ? v.map(obj) : []);
export const num = (v: unknown): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return 0;
};
export const numONull = (v: unknown): number | null =>
  v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null;
export const txt = (v: unknown): string => (typeof v === "string" ? v : "");
export const txtONull = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
export const bool = (v: unknown): boolean => v === true;

// Filas { o_seccion, o_datos } -> mapa seccion -> datos.
export function porSeccion(filas: unknown): Map<string, unknown> {
  const mapa = new Map<string, unknown>();
  if (!Array.isArray(filas)) return mapa;
  for (const fila of filas) {
    const f = obj(fila);
    mapa.set(txt(f.o_seccion), f.o_datos);
  }
  return mapa;
}

export type Resumen = {
  usuariosTotal: number;
  gestionados: number;
  nuevos7d: number;
  nuevos30d: number;
  activosHoy: number;
  activos7d: number;
  activos30d: number;
  vitaPlusActivos: number;
  onboardingPct: number | null;
  costoHoyUsd: number;
  costoMesUsd: number;
  mensajesHoy: number;
  pagosNoAcreditados30d: number;
  arrepentimientos: number;
  cronFallos24h: number;
  httpFallos24h: number;
};

export function leerResumen(filas: unknown): Resumen | null {
  const f = Array.isArray(filas) ? obj(filas[0]) : obj(filas);
  if (!("o_usuarios_total" in f)) return null;
  return {
    usuariosTotal: num(f.o_usuarios_total),
    gestionados: num(f.o_gestionados),
    nuevos7d: num(f.o_nuevos_7d),
    nuevos30d: num(f.o_nuevos_30d),
    activosHoy: num(f.o_activos_hoy),
    activos7d: num(f.o_activos_7d),
    activos30d: num(f.o_activos_30d),
    vitaPlusActivos: num(f.o_vita_plus_activos),
    onboardingPct: numONull(f.o_onboarding_pct),
    costoHoyUsd: num(f.o_costo_hoy_usd),
    costoMesUsd: num(f.o_costo_mes_usd),
    mensajesHoy: num(f.o_mensajes_hoy),
    pagosNoAcreditados30d: num(f.o_pagos_no_acreditados_30d),
    arrepentimientos: num(f.o_arrepentimientos),
    cronFallos24h: num(f.o_cron_fallos_24h),
    httpFallos24h: num(f.o_http_fallos_24h),
  };
}

export type FilaUsuario = {
  id: string;
  email: string;
  nombre: string | null;
  creado: string | null;
  ultimoLogin: string | null;
  ultimaActividad: string | null;
  diasInactivo: number | null;
  vitaPlus: boolean;
  vence: string | null;
  plan: string | null;
  tipo: string;
  personasCuida: number;
  cuidadores: number;
  costo30dUsd: number;
  tokens30d: number;
  onboarding: boolean;
};

export function leerUsuarios(filas: unknown): { total: number; filas: FilaUsuario[] } {
  const rows = lista(filas);
  return {
    total: rows.length > 0 ? num(rows[0].o_total) : 0,
    filas: rows.map((r) => ({
      id: txt(r.o_id),
      email: txt(r.o_email),
      nombre: txtONull(r.o_nombre),
      creado: txtONull(r.o_creado),
      ultimoLogin: txtONull(r.o_ultimo_login),
      ultimaActividad: txtONull(r.o_ultima_actividad),
      diasInactivo: numONull(r.o_dias_inactivo),
      vitaPlus: bool(r.o_vita_plus),
      vence: txtONull(r.o_vence),
      plan: txtONull(r.o_plan),
      tipo: txt(r.o_tipo) || "real",
      personasCuida: num(r.o_personas_cuida),
      cuidadores: num(r.o_cuidadores),
      costo30dUsd: num(r.o_costo_30d_usd),
      tokens30d: num(r.o_tokens_30d),
      onboarding: bool(r.o_onboarding),
    })),
  };
}

export type UsoDia = {
  fecha: string;
  costoUsd: number;
  tokensInput: number;
  tokensOutput: number;
  cacheLectura: number;
  cacheEscritura: number;
  llamadas: number;
  usuarios: number;
  mensajes: number;
  ratioCache: number | null;
};

function leerUsoDia(r: Obj): UsoDia {
  return {
    fecha: txt(r.fecha),
    costoUsd: num(r.costo_usd),
    tokensInput: num(r.tokens_input),
    tokensOutput: num(r.tokens_output),
    cacheLectura: num(r.cache_lectura),
    cacheEscritura: num(r.cache_escritura),
    llamadas: num(r.llamadas),
    usuarios: num(r.usuarios),
    mensajes: num(r.mensajes),
    ratioCache: numONull(r.ratio_cache),
  };
}

export type VinculoNombre = { id: string; nombre: string | null; rol: string; desde: string | null };
export type SuscripcionFila = { plan: string; estado: string; meses: number; usdCentavos: number; arsPesos: number; creada: string | null };
export type PagoFila = { pagoId: string; arsPesos: number; meses: number; creado: string | null };

export type UsuarioDetalle = {
  cuenta: {
    id: string;
    email: string;
    nombre: string | null;
    creado: string | null;
    ultimoLogin: string | null;
    emailConfirmado: boolean;
    ultimaActividad: string | null;
    diasInactivo: number | null;
    tipo: string;
    onboarding: boolean;
    memoriaActiva: boolean;
    vitaPlus: boolean;
    vence: string | null;
    plan: string | null;
  };
  usoDiario: UsoDia[];
  conteos: Record<string, number>;
  cuidadores: VinculoNombre[];
  cuidaA: VinculoNombre[];
  suscripciones: SuscripcionFila[];
  pagos: PagoFila[];
};

const leerVinculo = (r: Obj): VinculoNombre => ({
  id: txt(r.id),
  nombre: txtONull(r.nombre),
  rol: txt(r.rol),
  desde: txtONull(r.desde),
});

export function leerUsuarioDetalle(filas: unknown): UsuarioDetalle | null {
  const s = porSeccion(filas);
  if (!s.has("cuenta")) return null;
  const c = obj(s.get("cuenta"));
  const conteos: Record<string, number> = {};
  for (const [k, v] of Object.entries(obj(s.get("conteos")))) conteos[k] = num(v);
  return {
    cuenta: {
      id: txt(c.id),
      email: txt(c.email),
      nombre: txtONull(c.nombre),
      creado: txtONull(c.creado),
      ultimoLogin: txtONull(c.ultimo_login),
      emailConfirmado: bool(c.email_confirmado),
      ultimaActividad: txtONull(c.ultima_actividad),
      diasInactivo: numONull(c.dias_inactivo),
      tipo: txt(c.tipo) || "real",
      onboarding: bool(c.onboarding),
      memoriaActiva: c.memoria_activa !== false,
      vitaPlus: bool(c.vita_plus),
      vence: txtONull(c.vence),
      plan: txtONull(c.plan),
    },
    usoDiario: lista(s.get("uso_diario")).map(leerUsoDia),
    conteos,
    cuidadores: lista(s.get("cuidadores")).map(leerVinculo),
    cuidaA: lista(s.get("cuida_a")).map(leerVinculo),
    suscripciones: lista(s.get("suscripciones")).map((r) => ({
      plan: txt(r.plan),
      estado: txt(r.estado),
      meses: num(r.meses),
      usdCentavos: num(r.usd_centavos),
      arsPesos: num(r.ars_pesos),
      creada: txtONull(r.creada),
    })),
    pagos: lista(s.get("pagos")).map((r) => ({
      pagoId: txt(r.pago_id),
      arsPesos: num(r.ars_pesos),
      meses: num(r.meses),
      creado: txtONull(r.creado),
    })),
  };
}

export type PanelIA = {
  diario: UsoDia[];
  top: { id: string; email: string; nombre: string | null; costoUsd: number; tokens: number; llamadas: number }[];
  errores: { resultado: string; codigo: string | null; n: number }[];
  latencia: {
    respuestas: number;
    ok: number;
    p50: number | null;
    p95: number | null;
    p50PrimerToken: number | null;
    p95PrimerToken: number | null;
  };
};

export function leerIA(filas: unknown): PanelIA {
  const s = porSeccion(filas);
  const l = obj(s.get("latencia"));
  return {
    diario: lista(s.get("diario")).map(leerUsoDia),
    top: lista(s.get("top_usuarios")).map((r) => ({
      id: txt(r.id),
      email: txt(r.email),
      nombre: txtONull(r.nombre),
      costoUsd: num(r.costo_usd),
      tokens: num(r.tokens),
      llamadas: num(r.llamadas),
    })),
    errores: lista(s.get("errores")).map((r) => ({ resultado: txt(r.resultado), codigo: txtONull(r.codigo), n: num(r.n) })),
    latencia: {
      respuestas: num(l.respuestas),
      ok: num(l.ok),
      p50: numONull(l.p50_ms),
      p95: numONull(l.p95_ms),
      p50PrimerToken: numONull(l.p50_primer_token_ms),
      p95PrimerToken: numONull(l.p95_primer_token_ms),
    },
  };
}

export type PanelVitaPlus = {
  activos: number;
  vencidos: number;
  canceladas: number;
  autorizadas: number;
  pausadas: number;
  pendientes: number;
  ingresosArs30d: number;
  pagos30d: number;
  ingresosArsTotal: number;
  noAcreditados: {
    clave: string;
    pagoId: string | null;
    motivo: string;
    monto: number | null;
    moneda: string | null;
    estadoMp: string | null;
    email: string | null;
    creado: string | null;
  }[];
  arrepentimientos: {
    id: string;
    usuarioId: string;
    email: string | null;
    nombre: string | null;
    solicitado: string | null;
    plan: string | null;
    arsPesos: number | null;
  }[];
};

export function leerVitaPlus(filas: unknown): PanelVitaPlus {
  const s = porSeccion(filas);
  const r = obj(s.get("resumen"));
  return {
    activos: num(r.activos),
    vencidos: num(r.vencidos),
    canceladas: num(r.canceladas),
    autorizadas: num(r.autorizadas),
    pausadas: num(r.pausadas),
    pendientes: num(r.pendientes),
    ingresosArs30d: num(r.ingresos_ars_30d),
    pagos30d: num(r.pagos_30d),
    ingresosArsTotal: num(r.ingresos_ars_total),
    noAcreditados: lista(s.get("no_acreditados")).map((x) => ({
      clave: txt(x.clave),
      pagoId: txtONull(x.pago_id),
      motivo: txt(x.motivo),
      monto: numONull(x.monto),
      moneda: txtONull(x.moneda),
      estadoMp: txtONull(x.estado_mp),
      email: txtONull(x.email),
      creado: txtONull(x.creado),
    })),
    arrepentimientos: lista(s.get("arrepentimientos")).map((x) => ({
      id: txt(x.id),
      usuarioId: txt(x.usuario_id),
      email: txtONull(x.email),
      nombre: txtONull(x.nombre),
      solicitado: txtONull(x.solicitado),
      plan: txtONull(x.plan),
      arsPesos: numONull(x.ars_pesos),
    })),
  };
}

export type PanelSistema = {
  cron: { nombre: string; schedule: string; activo: boolean; ultimoEstado: string | null; ultimaCorrida: string | null; corridas24h: number; fallos24h: number }[];
  http: { codigo: string; n: number }[];
  dbBytes: number;
  tablas: { nombre: string; bytes: number; filas: number }[];
  migracion: string | null;
  storage: { bucket: string; objetos: number; bytes: number }[];
  push: { suscripciones: number; usuarios: number };
};

export function leerSistema(filas: unknown): PanelSistema {
  const s = porSeccion(filas);
  const push = obj(s.get("push"));
  return {
    cron: lista(s.get("cron")).map((r) => ({
      nombre: txt(r.nombre),
      schedule: txt(r.schedule),
      activo: bool(r.activo),
      ultimoEstado: txtONull(r.ultimo_estado),
      ultimaCorrida: txtONull(r.ultima_corrida),
      corridas24h: num(r.corridas_24h),
      fallos24h: num(r.fallos_24h),
    })),
    http: lista(s.get("http")).map((r) => ({ codigo: txt(r.codigo), n: num(r.n) })),
    dbBytes: num(obj(s.get("db")).bytes),
    tablas: lista(s.get("tablas")).map((r) => ({ nombre: txt(r.nombre), bytes: num(r.bytes), filas: num(r.filas) })),
    migracion: txtONull(obj(s.get("migracion")).version),
    storage: lista(s.get("storage")).map((r) => ({ bucket: txt(r.bucket), objetos: num(r.objetos), bytes: num(r.bytes) })),
    push: { suscripciones: num(push.suscripciones), usuarios: num(push.usuarios) },
  };
}
