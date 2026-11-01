// Tabla de precios de vita+ y cuentas de pesificación. Módulo PURO y seguro para el cliente (sin Node ni
// server-only): lo usan la pantalla, las rutas y los tests. El servidor es la única fuente de verdad: el
// cliente manda la CLAVE del plan, nunca un monto.
//
// Unidades: los dólares viajan siempre en CENTAVOS enteros (US$ 4,99 = 499) y los pesos en PESOS enteros
// (redondeados). El tipo de cambio es un número de pesos por dólar (dólar oficial BNA, venta).

export type PlanVitaPlus = "anual" | "mensual";

export interface DefinicionPlan {
  clave: PlanVitaPlus;
  label: string;
  /** Cada cuántos meses cobra Mercado Pago (y cuántos meses de vita+ otorga cada cobro aprobado). */
  meses: 1 | 12;
  /** Lo que se cobra en cada período, en centavos de dólar. */
  usdCentavos: number;
  /** Lo que se muestra como precio por mes, en centavos de dólar. */
  usdPorMesCentavos: number;
  /** Texto de `reason` del preapproval (lo ve la persona en Mercado Pago). */
  razon: string;
}

export const PLANES_VITA_PLUS: Record<PlanVitaPlus, DefinicionPlan> = {
  anual: { clave: "anual", label: "Anual", meses: 12, usdCentavos: 3588, usdPorMesCentavos: 299, razon: "vita+ anual" },
  mensual: { clave: "mensual", label: "Mensual", meses: 1, usdCentavos: 499, usdPorMesCentavos: 499, razon: "vita+ mensual" },
};

export function esPlanVitaPlus(valor: unknown): valor is PlanVitaPlus {
  return valor === "anual" || valor === "mensual";
}

/** Rango de cotizaciones que se acepta como sensata (pesos por dólar). Fuera de esto no se crea nada. */
export const COTIZACION_MIN = 100;
export const COTIZACION_MAX = 100_000;

/** Devuelve la cotización si es un número finito dentro del rango sensato; si no, null. */
export function validarCotizacion(valor: unknown): number | null {
  if (typeof valor !== "number" || !Number.isFinite(valor)) return null;
  if (valor < COTIZACION_MIN || valor > COTIZACION_MAX) return null;
  return valor;
}

/** Pesos enteros a cobrar por `usdCentavos` al tipo de cambio `fx`, redondeado al peso. */
export function calcularPesos(usdCentavos: number, fx: number): number {
  return Math.round((usdCentavos * fx) / 100);
}

function conMiles(n: number): string {
  return String(Math.trunc(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** "$ 6.250" */
export function formatoPesos(pesos: number): string {
  return `$ ${conMiles(pesos)}`;
}

/** "US$ 2,99" */
export function formatoUsd(centavos: number): string {
  const enteros = Math.trunc(centavos / 100);
  const resto = String(centavos % 100).padStart(2, "0");
  return `US$ ${conMiles(enteros)},${resto}`;
}

/** Cotización para mostrar: "1.252" (sin decimales si es entera, con coma si no). */
export function formatoCotizacion(fx: number): string {
  const redondeada = Math.round(fx * 100) / 100;
  const [enteros, decimales] = String(redondeada).split(".");
  return decimales ? `${conMiles(Number(enteros))},${decimales.padEnd(2, "0")}` : conMiles(Number(enteros));
}

/** "$ 6.250 por mes" / "$ 44.939 por año" */
export function textoPesosPorPeriodo(plan: PlanVitaPlus, pesos: number): string {
  return `${formatoPesos(pesos)} por ${plan === "anual" ? "año" : "mes"}`;
}

export interface CotizacionPlanes {
  fx: number;
  /** ISO de cuándo se consultó la cotización. */
  fecha: string;
  pesos: Record<PlanVitaPlus, number>;
}

export function cotizarPlanes(fx: number, fecha: string): CotizacionPlanes {
  return {
    fx,
    fecha,
    pesos: {
      anual: calcularPesos(PLANES_VITA_PLUS.anual.usdCentavos, fx),
      mensual: calcularPesos(PLANES_VITA_PLUS.mensual.usdCentavos, fx),
    },
  };
}

export type EstadoSuscripcion = "none" | "pending" | "authorized" | "paused" | "cancelled";

/** Estado de vita+ de una cuenta tal como lo ve la UI. */
export interface EstadoVitaPlus {
  activo: boolean;
  /** ISO. Hasta cuándo tiene vita+ pago; null si nunca lo tuvo. */
  venceAt: string | null;
  plan: PlanVitaPlus | null;
  estado: EstadoSuscripcion;
  /** true si Mercado Pago va a seguir cobrando (suscripción autorizada). */
  renueva: boolean;
  /** true dentro de los 10 días del primer cobro, si no pidió ya el arrepentimiento (Res. 424/2020). */
  puedeArrepentirse: boolean;
}

export const ESTADO_SIN_VITA_PLUS: EstadoVitaPlus = {
  activo: false,
  venceAt: null,
  plan: null,
  estado: "none",
  renueva: false,
  puedeArrepentirse: false,
};

/** "12 de noviembre de 2026" en hora argentina. */
export function fechaLarga(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(d);
}
