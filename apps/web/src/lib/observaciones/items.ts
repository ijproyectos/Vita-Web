import type { Observacion } from "./tipos";

/** Lo que las pantallas necesitan de una observación (sin claves ni datos internos). */
export type ItemObservacion = {
  id: string;
  severidad: "info" | "atencion";
  titulo: string;
  texto: string;
  href: string | null;
  vista: boolean;
};

export function aItemsObservacion(lista: Observacion[]): ItemObservacion[] {
  return lista.map((o) => ({ id: o.id, severidad: o.severidad, titulo: o.titulo, texto: o.texto, href: o.href, vista: o.vista_at !== null }));
}
