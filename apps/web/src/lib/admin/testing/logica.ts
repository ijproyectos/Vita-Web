// Lógica pura del módulo Testing del panel (sin Next ni Supabase, para poder testearla). Portada de vita-track
// (`modules/testing/types.ts`) con nombres en español y las reglas de validación de los formularios.

export const ESTADOS_PRUEBA = ["OK", "Falla", "Bloqueado", "No aplica"] as const;
export type EstadoPrueba = (typeof ESTADOS_PRUEBA)[number];
/** El estado de un caso es el de su última prueba, o Pendiente si nadie lo probó. */
export type EstadoCaso = EstadoPrueba | "Pendiente";
export const ESTADOS_CASO: readonly EstadoCaso[] = ["Pendiente", ...ESTADOS_PRUEBA];

export const PRIORIDADES = ["Alta", "Media", "Baja"] as const;
export type Prioridad = (typeof PRIORIDADES)[number];
export const SEVERIDADES = ["Crítica", "Alta", "Media", "Baja"] as const;
export type Severidad = (typeof SEVERIDADES)[number];
export const ESTADOS_BUG = ["Abierto", "En arreglo", "Arreglado", "Verificado", "Descartado"] as const;
export type EstadoBug = (typeof ESTADOS_BUG)[number];
export const CANALES = ["WhatsApp", "Mail", "Reportar en la app", "En persona", "Otro"] as const;
export type Canal = (typeof CANALES)[number];
export const ESTADOS_REPORTE = ["Nuevo", "En revisión", "Reproducido", "No se reproduce", "Duplicado", "Es una mejora", "Resuelto", "Respondido"] as const;
export type EstadoReporte = (typeof ESTADOS_REPORTE)[number];
export const ESTADOS_RONDA = ["activa", "cerrada"] as const;
export type EstadoRonda = (typeof ESTADOS_RONDA)[number];

export const AREAS: readonly string[] = [
  "Acceso",
  "Onboarding",
  "Medicamentos",
  "Rutina",
  "Turnos",
  "Avisos",
  "Mi Salud",
  "Perfil",
  "Familia",
  "Modo simple",
  "Chat vita",
  "vita+",
  "General",
  "Otro",
];

export type Caso = {
  id: number;
  codigo: string;
  area: string;
  funcionalidad: string;
  prioridad: Prioridad;
  precondicion: string;
  pasos: string;
  esperado: string;
  posicion: number;
  archivado: boolean;
};

export type Prueba = {
  id: number;
  caso_id: number;
  estado: EstadoPrueba;
  resultado: string;
  dispositivo: string;
  admin_email: string;
  ronda_id: number | null;
  asignacion_id: number | null;
  bug_id: number | null;
  fecha: string;
  created_at: string;
};

export type Bug = {
  id: number;
  codigo: string;
  caso_id: number | null;
  titulo: string;
  pasos: string;
  actual: string;
  esperado: string;
  severidad: Severidad;
  dispositivo: string;
  enlace: string;
  estado: EstadoBug;
  responsable_email: string | null;
  reportado_por: string;
  recibido_por_email: string | null;
  ticket_externo: string;
  notas: string;
  creado_por: string;
  created_at: string;
};

export type Reporte = {
  id: number;
  codigo: string;
  fecha: string;
  reportante: string;
  canal: Canal;
  area: string;
  haciendo: string;
  paso: string;
  dispositivo: string;
  version_app: string;
  enlace: string;
  severidad: Severidad;
  estado: EstadoReporte;
  bug_id: number | null;
  respuesta: string;
  notas: string;
  created_at: string;
};

export type Asignacion = { id: number; ronda_id: number; caso_id: number; admin_email: string | null; dispositivo: string };

// --- Estados ---------------------------------------------------------------------------------------------------------

export const esBugAbierto = (b: Pick<Bug, "estado">): boolean => b.estado === "Abierto" || b.estado === "En arreglo";
export const esReportePendiente = (r: Pick<Reporte, "estado">): boolean =>
  r.estado === "Nuevo" || r.estado === "En revisión" || r.estado === "Reproducido";
/** Un bug se considera cerrado (para la auditoría) cuando queda verificado o descartado. */
export const esBugCerrado = (estado: EstadoBug): boolean => estado === "Verificado" || estado === "Descartado";

const TRANSICIONES_BUG: Record<EstadoBug, readonly EstadoBug[]> = {
  Abierto: ["En arreglo", "Arreglado", "Descartado"],
  "En arreglo": ["Abierto", "Arreglado", "Descartado"],
  Arreglado: ["Verificado", "Abierto"],
  Verificado: ["Abierto"],
  Descartado: ["Abierto"],
};

/** Estados a los que puede pasar un bug desde el actual (reabrir siempre se puede; verificar exige que esté arreglado). */
export function transicionesBug(desde: EstadoBug): readonly EstadoBug[] {
  return TRANSICIONES_BUG[desde] ?? [];
}

export const puedePasarBug = (desde: EstadoBug, hacia: EstadoBug): boolean => desde === hacia || transicionesBug(desde).includes(hacia);

// --- Resúmenes -------------------------------------------------------------------------------------------------------

/** La última prueba de cada caso (vengan en el orden que vengan). */
export function ultimaPruebaPorCaso(pruebas: readonly Prueba[]): Map<number, Prueba> {
  const ultima = new Map<number, Prueba>();
  for (const p of pruebas) {
    const actual = ultima.get(p.caso_id);
    if (!actual || p.created_at > actual.created_at || (p.created_at === actual.created_at && p.id > actual.id)) ultima.set(p.caso_id, p);
  }
  return ultima;
}

export const estadoDeCaso = (ultima: Prueba | undefined): EstadoCaso => ultima?.estado ?? "Pendiente";

export type ConteoEstados = Record<EstadoCaso, number>;

function ceroEstados(): ConteoEstados {
  return { Pendiente: 0, OK: 0, Falla: 0, Bloqueado: 0, "No aplica": 0 };
}

export type ResumenArea = { area: string; total: number; conteo: ConteoEstados; tasaOk: number | null };

/** Porcentaje de OK sobre lo probado y aplicable (sin Pendiente ni No aplica). null si todavía no hay nada probado. */
export function tasaOk(conteo: ConteoEstados): number | null {
  const probados = conteo.OK + conteo.Falla + conteo.Bloqueado;
  return probados === 0 ? null : Math.round((conteo.OK / probados) * 1000) / 10;
}

function ordenArea(nombre: string): number {
  const i = AREAS.indexOf(nombre);
  return i === -1 ? AREAS.length : i;
}

export type Resumen = {
  total: number;
  conteo: ConteoEstados;
  /** Casos ya probados sobre el total, de 0 a 1. */
  avance: number;
  tasaOk: number | null;
  porArea: ResumenArea[];
  bugsAbiertos: number;
  bugsPorSeveridad: Record<Severidad, number>;
  reportesPendientes: number;
};

export function resumir(casos: readonly Caso[], pruebas: readonly Prueba[], bugs: readonly Bug[], reportes: readonly Reporte[]): Resumen {
  const activos = casos.filter((c) => !c.archivado);
  const ultima = ultimaPruebaPorCaso(pruebas);
  const conteo = ceroEstados();
  const areas = new Map<string, ResumenArea>();
  for (const c of activos) {
    const estado = estadoDeCaso(ultima.get(c.id));
    conteo[estado] += 1;
    let a = areas.get(c.area);
    if (!a) {
      a = { area: c.area, total: 0, conteo: ceroEstados(), tasaOk: null };
      areas.set(c.area, a);
    }
    a.total += 1;
    a.conteo[estado] += 1;
  }
  const porArea = [...areas.values()]
    .map((a) => ({ ...a, tasaOk: tasaOk(a.conteo) }))
    .sort((a, b) => ordenArea(a.area) - ordenArea(b.area) || a.area.localeCompare(b.area, "es"));
  const abiertos = bugs.filter(esBugAbierto);
  const bugsPorSeveridad: Record<Severidad, number> = { Crítica: 0, Alta: 0, Media: 0, Baja: 0 };
  for (const b of abiertos) bugsPorSeveridad[b.severidad] += 1;
  return {
    total: activos.length,
    conteo,
    avance: activos.length === 0 ? 0 : (activos.length - conteo.Pendiente) / activos.length,
    tasaOk: tasaOk(conteo),
    porArea,
    bugsAbiertos: abiertos.length,
    bugsPorSeveridad,
    reportesPendientes: reportes.filter(esReportePendiente).length,
  };
}

export type ResumenRonda = {
  total: number;
  conteo: ConteoEstados;
  avance: number;
  tasaOk: number | null;
  porArea: ResumenArea[];
};

/**
 * Avance de una ronda: cada asignación cuenta con el estado de su última prueba (sin prueba = Pendiente). Se parte por área
 * del caso. `casoPorId` resuelve el área; una asignación cuyo caso ya no existe se ignora.
 */
export function resumirRonda(asignaciones: readonly Asignacion[], pruebas: readonly Prueba[], casoPorId: ReadonlyMap<number, Caso>): ResumenRonda {
  const ultimaPorAsignacion = new Map<number, Prueba>();
  for (const p of pruebas) {
    if (p.asignacion_id === null) continue;
    const actual = ultimaPorAsignacion.get(p.asignacion_id);
    if (!actual || p.created_at > actual.created_at || (p.created_at === actual.created_at && p.id > actual.id)) ultimaPorAsignacion.set(p.asignacion_id, p);
  }
  const conteo = ceroEstados();
  const areas = new Map<string, ResumenArea>();
  let total = 0;
  for (const a of asignaciones) {
    const caso = casoPorId.get(a.caso_id);
    if (!caso) continue;
    const estado = estadoDeCaso(ultimaPorAsignacion.get(a.id));
    total += 1;
    conteo[estado] += 1;
    let r = areas.get(caso.area);
    if (!r) {
      r = { area: caso.area, total: 0, conteo: ceroEstados(), tasaOk: null };
      areas.set(caso.area, r);
    }
    r.total += 1;
    r.conteo[estado] += 1;
  }
  const porArea = [...areas.values()]
    .map((a) => ({ ...a, tasaOk: tasaOk(a.conteo) }))
    .sort((a, b) => ordenArea(a.area) - ordenArea(b.area) || a.area.localeCompare(b.area, "es"));
  return { total, conteo, avance: total === 0 ? 0 : (total - conteo.Pendiente) / total, tasaOk: tasaOk(conteo), porArea };
}

// --- Filtros ---------------------------------------------------------------------------------------------------------

export type FiltroCasos = { area?: string; estado?: EstadoCaso | ""; q?: string };

function sinAcentos(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/** Casos activos filtrados por área, estado (el de su última prueba) y texto (código, funcionalidad, pasos). */
export function filtrarCasos(casos: readonly Caso[], ultima: ReadonlyMap<number, Prueba>, f: FiltroCasos): Caso[] {
  const q = sinAcentos((f.q ?? "").trim());
  return casos.filter((c) => {
    if (c.archivado) return false;
    if (f.area && c.area !== f.area) return false;
    if (f.estado && estadoDeCaso(ultima.get(c.id)) !== f.estado) return false;
    if (q && !sinAcentos(`${c.codigo} ${c.funcionalidad} ${c.pasos}`).includes(q)) return false;
    return true;
  });
}

export type FiltroBugs = { estado?: EstadoBug | "abiertos" | ""; severidad?: Severidad | "" };

export function filtrarBugs(bugs: readonly Bug[], f: FiltroBugs): Bug[] {
  return bugs.filter((b) => {
    if (f.estado === "abiertos" ? !esBugAbierto(b) : f.estado && b.estado !== f.estado) return false;
    if (f.severidad && b.severidad !== f.severidad) return false;
    return true;
  });
}

const PESO_SEVERIDAD: Record<Severidad, number> = { Crítica: 0, Alta: 1, Media: 2, Baja: 3 };
/** Más graves primero, y a igual gravedad el más nuevo. */
export function ordenarBugs(bugs: readonly Bug[]): Bug[] {
  return [...bugs].sort((a, b) => PESO_SEVERIDAD[a.severidad] - PESO_SEVERIDAD[b.severidad] || b.id - a.id);
}

/** Tono visual compartido por casos, bugs y reportes. */
export function tono(valor: string): "ok" | "alerta" | "aviso" | "neutro" {
  switch (valor) {
    case "OK":
    case "Arreglado":
    case "Verificado":
    case "Resuelto":
    case "Respondido":
    case "activa":
      return "ok";
    case "Falla":
    case "Abierto":
    case "Crítica":
    case "Nuevo":
      return "alerta";
    case "Bloqueado":
    case "En arreglo":
    case "Alta":
    case "En revisión":
    case "Reproducido":
      return "aviso";
    default:
      return "neutro";
  }
}

// --- Historial de bugs -----------------------------------------------------------------------------------------------

export type CambioBug = { campo: string; anterior: string | null; nuevo: string | null };

const CAMPOS_BUG: ReadonlyArray<{ clave: keyof Bug; etiqueta: string }> = [
  { clave: "estado", etiqueta: "Estado" },
  { clave: "severidad", etiqueta: "Severidad" },
  { clave: "responsable_email", etiqueta: "Quién lo arregla" },
  { clave: "recibido_por_email", etiqueta: "Se lo contó a" },
  { clave: "reportado_por", etiqueta: "Reportado por" },
  { clave: "titulo", etiqueta: "Título" },
  { clave: "ticket_externo", etiqueta: "Ticket externo" },
];

const recortar = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s.slice(0, 250);
};

/** Qué cambió entre dos versiones de un bug (los campos que el historial registra). Sin texto largo: solo valores cortos. */
export function cambiosDeBug(antes: Bug, despues: Bug): CambioBug[] {
  const out: CambioBug[] = [];
  for (const { clave, etiqueta } of CAMPOS_BUG) {
    const a = recortar(antes[clave]);
    const d = recortar(despues[clave]);
    if (a !== d) out.push({ campo: etiqueta, anterior: a, nuevo: d });
  }
  return out;
}

// --- Validación de formularios ---------------------------------------------------------------------------------------

export type Validacion<T> = { ok: true; datos: T } | { ok: false; mensaje: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizarEmail(crudo: unknown): string | null {
  if (typeof crudo !== "string") return null;
  const e = crudo.trim().toLowerCase();
  return e.length <= 320 && EMAIL.test(e) ? e : null;
}

/** Email opcional: vacío = null (sin persona), algo mal escrito = undefined (error). */
export function emailOpcional(crudo: unknown): string | null | undefined {
  if (crudo === null || crudo === undefined) return null;
  if (typeof crudo === "string" && crudo.trim() === "") return null;
  return normalizarEmail(crudo) ?? undefined;
}

export function texto(crudo: unknown, max: number): string {
  return typeof crudo === "string" ? crudo.replace(/\u0000/g, "").trim().slice(0, max) : "";
}

function enLista<T extends string>(crudo: unknown, lista: readonly T[]): T | null {
  return typeof crudo === "string" && (lista as readonly string[]).includes(crudo) ? (crudo as T) : null;
}

const ID = /^\d{1,15}$/;
export function entero(crudo: unknown): number | null {
  const s = typeof crudo === "string" ? crudo.trim() : typeof crudo === "number" ? String(crudo) : "";
  return ID.test(s) ? Number(s) : null;
}

export function enteroOpcional(crudo: unknown): number | null | undefined {
  if (crudo === null || crudo === undefined || (typeof crudo === "string" && crudo.trim() === "")) return null;
  return entero(crudo) ?? undefined;
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
export function fechaIso(crudo: unknown): string | null {
  if (typeof crudo !== "string" || !FECHA.test(crudo)) return null;
  const d = new Date(`${crudo}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== crudo ? null : crudo;
}

export type DatosPrueba = { estado: EstadoPrueba; resultado: string; dispositivo: string };

export function validarPrueba(c: { estado: unknown; resultado: unknown; dispositivo: unknown }): Validacion<DatosPrueba> {
  const estado = enLista(c.estado, ESTADOS_PRUEBA);
  if (!estado) return { ok: false, mensaje: "Elegí el resultado de la prueba." };
  const resultado = texto(c.resultado, 4000);
  if (estado === "Falla" && resultado === "") return { ok: false, mensaje: "Contá qué pasó para registrar la falla." };
  return { ok: true, datos: { estado, resultado, dispositivo: texto(c.dispositivo, 200) } };
}

export type DatosBug = Pick<Bug, "titulo" | "pasos" | "actual" | "esperado" | "severidad" | "dispositivo" | "enlace" | "reportado_por" | "ticket_externo" | "notas"> & {
  caso_id: number | null;
  responsable_email: string | null;
  recibido_por_email: string | null;
};

export function enlaceValido(crudo: string): boolean {
  if (crudo === "") return true;
  try {
    const u = new URL(crudo);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

export function validarBug(c: Record<string, unknown>): Validacion<DatosBug> {
  const titulo = texto(c.titulo, 250);
  if (titulo === "") return { ok: false, mensaje: "Ponele un título al bug." };
  const severidad = enLista(c.severidad, SEVERIDADES);
  if (!severidad) return { ok: false, mensaje: "Elegí la severidad." };
  const responsable = emailOpcional(c.responsable_email);
  const recibido = emailOpcional(c.recibido_por_email);
  if (responsable === undefined || recibido === undefined) return { ok: false, mensaje: "Elegí personas del equipo." };
  const casoId = enteroOpcional(c.caso_id);
  if (casoId === undefined) return { ok: false, mensaje: "El caso no es válido." };
  const enlace = texto(c.enlace, 500);
  if (!enlaceValido(enlace)) return { ok: false, mensaje: "El link tiene que empezar con http:// o https://." };
  return {
    ok: true,
    datos: {
      titulo,
      pasos: texto(c.pasos, 4000),
      actual: texto(c.actual, 4000),
      esperado: texto(c.esperado, 4000),
      severidad,
      dispositivo: texto(c.dispositivo, 200),
      enlace,
      reportado_por: texto(c.reportado_por, 200),
      ticket_externo: texto(c.ticket_externo, 60),
      notas: texto(c.notas, 4000),
      caso_id: casoId,
      responsable_email: responsable,
      recibido_por_email: recibido,
    },
  };
}

export type DatosRonda = { nombre: string; version_app: string; desde: string; hasta: string | null; notas: string };

export function validarRonda(c: Record<string, unknown>, hoy: string): Validacion<DatosRonda> {
  const nombre = texto(c.nombre, 120);
  if (nombre === "") return { ok: false, mensaje: "Ponele un nombre a la ronda." };
  const desde = c.desde === "" || c.desde === undefined || c.desde === null ? hoy : fechaIso(c.desde);
  if (!desde) return { ok: false, mensaje: "La fecha de inicio no es válida." };
  const hastaCrudo = c.hasta;
  const hasta = hastaCrudo === "" || hastaCrudo === undefined || hastaCrudo === null ? null : fechaIso(hastaCrudo);
  if (hastaCrudo !== "" && hastaCrudo !== undefined && hastaCrudo !== null && !hasta) return { ok: false, mensaje: "La fecha de cierre no es válida." };
  if (hasta && hasta < desde) return { ok: false, mensaje: "La ronda no puede cerrar antes de empezar." };
  return { ok: true, datos: { nombre, version_app: texto(c.version_app, 40), desde, hasta, notas: texto(c.notas, 2000) } };
}

export type DatosReporte = Pick<Reporte, "reportante" | "area" | "haciendo" | "paso" | "dispositivo" | "version_app" | "enlace" | "respuesta" | "notas"> & {
  canal: Canal;
  severidad: Severidad;
  estado: EstadoReporte;
  fecha: string;
};

export function validarReporte(c: Record<string, unknown>, hoy: string): Validacion<DatosReporte> {
  const canal = enLista(c.canal, CANALES);
  const severidad = enLista(c.severidad, SEVERIDADES);
  const estado = c.estado === undefined ? "Nuevo" : enLista(c.estado, ESTADOS_REPORTE);
  if (!canal || !severidad || !estado) return { ok: false, mensaje: "Revisá el canal, la severidad y el estado." };
  const paso = texto(c.paso, 4000);
  if (paso === "") return { ok: false, mensaje: "Contá qué pasó." };
  const fecha = c.fecha === "" || c.fecha === undefined ? hoy : fechaIso(c.fecha);
  if (!fecha) return { ok: false, mensaje: "La fecha no es válida." };
  const enlace = texto(c.enlace, 500);
  if (!enlaceValido(enlace)) return { ok: false, mensaje: "El link tiene que empezar con http:// o https://." };
  return {
    ok: true,
    datos: {
      canal,
      severidad,
      estado,
      fecha,
      reportante: texto(c.reportante, 200),
      area: texto(c.area, 60) || "General",
      haciendo: texto(c.haciendo, 2000),
      paso,
      dispositivo: texto(c.dispositivo, 200),
      version_app: texto(c.version_app, 40),
      enlace,
      respuesta: texto(c.respuesta, 2000),
      notas: texto(c.notas, 2000),
    },
  };
}

// --- Adjuntos --------------------------------------------------------------------------------------------------------

export const TIPOS_ADJUNTO = ["image/png", "image/jpeg", "image/webp", "image/gif", "video/mp4", "video/quicktime", "video/webm"] as const;
export const MAX_BYTES_ADJUNTO = 25 * 1024 * 1024;

export function validarAdjunto(mime: unknown, bytes: unknown): Validacion<{ mime: (typeof TIPOS_ADJUNTO)[number]; bytes: number }> {
  const m = enLista(mime, TIPOS_ADJUNTO);
  if (!m) return { ok: false, mensaje: "Solo se pueden subir imágenes (png, jpg, webp, gif) o videos (mp4, mov, webm)." };
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes <= 0) return { ok: false, mensaje: "El archivo está vacío." };
  if (bytes > MAX_BYTES_ADJUNTO) return { ok: false, mensaje: "El archivo pesa más de 25 MB." };
  return { ok: true, datos: { mime: m, bytes } };
}

/** Nombre apto para una ruta de Storage: sin acentos ni caracteres raros, con la extensión. */
export function nombreSeguro(nombre: string): string {
  const limpio = sinAcentos(nombre)
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(-80);
  return limpio || "archivo";
}

const RUTA_ADJUNTO = /^adjuntos\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[a-z0-9._-]{1,80}$/;
export const rutaAdjuntoValida = (ruta: unknown): ruta is string => typeof ruta === "string" && RUTA_ADJUNTO.test(ruta);
