export type EstadoValor = "normal" | "alto" | "bajo";

// Un valor de laboratorio. `nombre`/`valor` existen desde siempre; el resto
// (unidad, rango de referencia, estado) solo está si la extracción lo leyó del
// documento — los estudios viejos no lo tienen y se siguen mostrando igual.
export type ValorEstudio = {
  nombre: string;
  valor: string;
  unidad?: string | null;
  rango_min?: number | null;
  rango_max?: number | null;
  rango_texto?: string | null;
  estado?: EstadoValor | null;
};

export type Estudio = {
  id: string;
  usuario_id: string;
  tipo: string | null;
  fecha: string | null;
  resumen: string | null;
  valores: ValorEstudio[];
  archivo_path: string;
  archivo_tipo: string;
  estado: "listo" | "error";
  created_at: string;
  /** Migración 026 (puede faltar). */
  lugar?: string | null;
};

// Estudio con una URL firmada temporal para ver la foto original — el
// bucket es privado, no hay una URL pública que simplemente armar.
export type EstudioConUrl = Estudio & { urlFirmada: string | null };

export type DatosExtraidos = {
  tipo: string | null;
  fecha: string | null;
  resumen: string | null;
  valores: ValorEstudio[];
};

export const TIPO_PDF = "application/pdf";

// Tope de tamaño del archivo (foto o PDF) — por debajo del bodySizeLimit de
// Server Actions (next.config.ts) y de los 32 MB del request a Anthropic.
export const TAMANIO_MAXIMO_BYTES = 10 * 1024 * 1024;
