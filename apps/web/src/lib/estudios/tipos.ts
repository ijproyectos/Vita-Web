export type ValorEstudio = { nombre: string; valor: string };

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
