export const CATEGORIAS_REPORTE = ["Recordatorios", "Remedios", "Familia", "Pagos", "Otro"] as const;
export type CategoriaReporte = (typeof CATEGORIAS_REPORTE)[number];

export const MAX_CAPTURA_BYTES = 5 * 1024 * 1024;
export const MAX_TEXTO_REPORTE = 4000;

export type EstadoReporte =
  | { status: "idle" }
  | { status: "success"; email: string | null }
  | { status: "error"; mensaje: string };
