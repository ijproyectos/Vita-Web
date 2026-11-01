// Formato del panel /adminvita: todo en hora de Argentina, dinero en USD (costo de IA) y ARS (ingresos).
// Módulo puro (sin `server-only`): lo usan el servidor y los tests.

const ZONA_AR = "America/Argentina/Buenos_Aires";

/** Chip de vita+ en listas y detalle: origen y vencimiento ("sin vencimiento" para los permanentes). */
export function resumenVitaPlus(v: {
  permanente: boolean;
  origen: "pago" | "codigo_plus" | "codigo_admin" | null;
  vence: string | null;
  plan: string | null;
}): { etiqueta: string; detalle: string } {
  const origen = v.origen === "codigo_admin" ? "Código admin" : v.origen === "codigo_plus" ? "Código plus" : "Pago";
  const plan = origen === "Pago" && v.plan ? ` (${v.plan})` : "";
  return {
    etiqueta: `vita+ · ${origen}${plan}`,
    detalle: v.permanente ? "sin vencimiento" : v.vence ? `hasta ${formatoFechaAR(v.vence)}` : "",
  };
}

export function formatoUSD(valor: number): string {
  const n = Number.isFinite(valor) ? valor : 0;
  return `US$ ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatoARS(valor: number): string {
  const n = Number.isFinite(valor) ? Math.round(valor) : 0;
  return `$ ${n.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
}

export function formatoNumero(valor: number): string {
  return (Number.isFinite(valor) ? valor : 0).toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

export function formatoPorcentaje(valor: number | null, decimales = 1): string {
  if (valor === null || !Number.isFinite(valor)) return "—";
  return `${valor.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: decimales })}%`;
}

export function formatoBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const unidades = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < unidades.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toLocaleString("es-AR", { maximumFractionDigits: i === 0 ? 0 : 1 })} ${unidades[i]}`;
}

export function formatoMs(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return "—";
  return ms >= 1000 ? `${(ms / 1000).toLocaleString("es-AR", { maximumFractionDigits: 1 })} s` : `${Math.round(ms)} ms`;
}

function fecha(iso: string | null | undefined, opciones: Intl.DateTimeFormatOptions): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-AR", { timeZone: ZONA_AR, ...opciones }).format(d);
}

export function formatoFechaHoraAR(iso: string | null | undefined): string {
  return fecha(iso, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

export function formatoFechaAR(iso: string | null | undefined): string {
  return fecha(iso, { day: "2-digit", month: "2-digit", year: "numeric" });
}

// "2026-11-01" (fecha calendario, sin zona) -> "01/11".
export function formatoDiaCorto(fechaISO: string): string {
  const [, m, d] = fechaISO.split("-");
  return m && d ? `${d}/${m}` : fechaISO;
}

export type ChipInactividad = {
  clave: "activo" | "reciente" | "enfriandose" | "inactivo";
  etiqueta: string;
  detalle: string;
};

// Días sin usar vita -> chip semántico: <=1 activo, 2-7, 8-30, >30 inactivo. Sin actividad registrada = inactivo.
export function chipInactividad(dias: number | null | undefined): ChipInactividad {
  if (dias === null || dias === undefined || !Number.isFinite(dias)) {
    return { clave: "inactivo", etiqueta: "Sin actividad", detalle: "sin uso registrado" };
  }
  const d = Math.max(0, Math.floor(dias));
  const detalle = d === 0 ? "hoy" : d === 1 ? "ayer" : `hace ${d} días`;
  if (d <= 1) return { clave: "activo", etiqueta: "Activo", detalle };
  if (d <= 7) return { clave: "reciente", etiqueta: "2–7 días", detalle };
  if (d <= 30) return { clave: "enfriandose", etiqueta: "8–30 días", detalle };
  return { clave: "inactivo", etiqueta: "Inactivo", detalle };
}

export const ETIQUETA_TIPO_CUENTA: Record<string, string> = {
  real: "Cuenta propia",
  gestionado: "Perfil gestionado",
  por_codigo: "Cuenta por código",
};
