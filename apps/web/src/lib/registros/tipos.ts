// Registros de Mi Salud (feed "Todo"): estudios + mediciones + consultas +
// vacunas. Sin `server-only` a propósito: el tipo y el armado del feed son puros.

export type OrigenRegistro = "manual" | "vita";

export type Consulta = {
  id: string;
  fecha: string; // YYYY-MM-DD
  especialidad: string;
  profesional: string | null;
  lugar: string | null;
  resumen: string | null;
  origen: OrigenRegistro;
  created_at: string;
};

export type Vacuna = {
  id: string;
  nombre: string;
  fecha: string; // YYYY-MM-DD
  dosis: string | null;
  lugar: string | null;
  origen: OrigenRegistro;
  created_at: string;
};

export type CategoriaRegistro = "estudio" | "medicion" | "consulta" | "vacuna";

export type RegistroSalud = {
  clave: string;
  cat: CategoriaRegistro;
  titulo: string;
  sub: string;
  /** "16 abr" */
  cuando: string;
  /** Orden cronológico descendente. */
  orden: string;
  origen: OrigenRegistro;
  /** Pastilla con clip: "PDF" / "FOTO". */
  adjunto?: string;
  href?: string;
};
