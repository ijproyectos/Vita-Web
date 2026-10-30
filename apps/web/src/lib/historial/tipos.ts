// Borrar historial (V7 Privacidad y datos). Sin "server-only": lo usa también
// el cliente para armar el texto de confirmación.
export type RangoBorrado = "1y" | "6m" | "all";

export const RANGOS_BORRADO: { valor: RangoBorrado; etiqueta: string; frase: string }[] = [
  { valor: "1y", etiqueta: "+1 año", frase: "de hace más de 1 año" },
  { valor: "6m", etiqueta: "+6 meses", frase: "de hace más de 6 meses" },
  { valor: "all", etiqueta: "Todo", frase: "de todo el tiempo" },
];

export function esRangoBorrado(v: unknown): v is RangoBorrado {
  return v === "1y" || v === "6m" || v === "all";
}

export type CantidadesBorradas = { tomas: number; mediciones: number; estudios: number; conversaciones: number; recuerdos: number };

export type EstadoBorrado =
  | { status: "success"; borrado: CantidadesBorradas }
  | { status: "error"; mensaje: string };
