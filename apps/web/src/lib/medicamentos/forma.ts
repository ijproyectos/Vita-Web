// Forma del medicamento y cantidad por toma (V7, `formCfg`). Lógica pura: la
// usan el alta, la edición y el cálculo de stock.

export type FormaMedicamento = "pastilla" | "jarabe" | "gotas" | "inyeccion" | "otro";

export const FORMAS: { clave: FormaMedicamento; etiqueta: string }[] = [
  { clave: "pastilla", etiqueta: "Pastilla" },
  { clave: "jarabe", etiqueta: "Jarabe" },
  { clave: "gotas", etiqueta: "Gotas" },
  { clave: "inyeccion", etiqueta: "Inyección" },
  { clave: "otro", etiqueta: "Otro" },
];

type ConfigForma = {
  placeholderDosis: string;
  paso: number;
  minimo: number;
  maximo: number;
  porDefecto: number;
  tituloCantidad: string;
  /** null = esa forma no lleva control de stock. */
  tituloStock: string | null;
  unidadStock: string;
  /** Cuánto stock consume una unidad de cantidad (20 gotas = 1 ml). */
  factorStock: number;
  conFoto: boolean;
};

export const CONFIG_FORMA: Record<FormaMedicamento, ConfigForma> = {
  pastilla: { placeholderDosis: "500 mg", paso: 0.5, minimo: 0.5, maximo: 4, porDefecto: 1, tituloCantidad: "Cuántas pastillas", tituloStock: "Pastillas", unidadStock: "pastillas", factorStock: 1, conFoto: true },
  jarabe: { placeholderDosis: "100 mg / 5 ml", paso: 2.5, minimo: 2.5, maximo: 30, porDefecto: 5, tituloCantidad: "Cuánto", tituloStock: "Cuánto queda", unidadStock: "ml", factorStock: 1, conFoto: false },
  gotas: { placeholderDosis: "20 mg / ml", paso: 1, minimo: 1, maximo: 60, porDefecto: 10, tituloCantidad: "Cuántas gotas", tituloStock: "Cuánto queda", unidadStock: "ml", factorStock: 1 / 20, conFoto: false },
  inyeccion: { placeholderDosis: "40 mg", paso: 1, minimo: 1, maximo: 4, porDefecto: 1, tituloCantidad: "Cuántas", tituloStock: "Cuánto queda", unidadStock: "unidades", factorStock: 1, conFoto: false },
  otro: { placeholderDosis: "Opcional", paso: 1, minimo: 1, maximo: 6, porDefecto: 1, tituloCantidad: "Cuántas veces", tituloStock: null, unidadStock: "", factorStock: 1, conFoto: false },
};

/** Tope del servidor: más amplio que el de la pantalla para no rechazar datos viejos. */
export const CANTIDAD_MAXIMA = 60;

export function esForma(valor: unknown): valor is FormaMedicamento {
  return typeof valor === "string" && valor in CONFIG_FORMA;
}

/** Forma que sugiere el nombre, o null si no dice nada. */
export function adivinarForma(nombre: string): FormaMedicamento | null {
  const n = nombre.toLowerCase();
  if (/jarabe|suspensi|susp\b/.test(n)) return "jarabe";
  if (/gota/.test(n)) return "gotas";
  if (/inyec|ampolla|insulina|jeringa/.test(n)) return "inyeccion";
  if (/crema|pomada|inhal|puff|parche|spray/.test(n)) return "otro";
  return null;
}

function numeroConComa(n: number): string {
  return String(n).replace(".", ",");
}

function pastillas(n: number): string {
  if (n === 0.5) return "½";
  return Number.isInteger(n) ? String(n) : `${Math.floor(n)}½`;
}

export function etiquetaCantidad(forma: FormaMedicamento, cantidad: number): string {
  switch (forma) {
    case "jarabe":
      return `${numeroConComa(cantidad)} ml`;
    case "gotas":
      return `${cantidad} ${cantidad === 1 ? "gota" : "gotas"}`;
    case "inyeccion":
      return `${cantidad} ${cantidad === 1 ? "aplicación" : "aplicaciones"}`;
    case "otro":
      return `${cantidad} ${cantidad === 1 ? "vez" : "veces"}`;
    default:
      return `${pastillas(cantidad)} ${cantidad > 1 ? "pastillas" : "pastilla"}`;
  }
}

export function pasoCantidad(forma: FormaMedicamento, cantidad: number, direccion: 1 | -1): number {
  const c = CONFIG_FORMA[forma];
  return Math.max(c.minimo, Math.min(c.maximo, cantidad + direccion * c.paso));
}

/** Stock que consume una toma de esa cantidad. */
export function consumoDeToma(forma: FormaMedicamento, cantidad: number): number {
  return cantidad * CONFIG_FORMA[forma].factorStock;
}

/** Línea de la fila de stock: "30 pastillas · te alcanzan 15 días" o el texto de vacío. */
export function resumenStock(forma: FormaMedicamento, stock: number | null, consumoPorDia: number): { texto: string; alerta: boolean } {
  const c = CONFIG_FORMA[forma];
  if (stock === null) return { texto: c.conFoto ? "Sin contar · opcional" : "Sin cargar · opcional", alerta: false };
  const dias = consumoPorDia > 0 ? Math.floor(stock / consumoPorDia) : 0;
  return {
    texto: `${numeroConComa(stock)} ${c.unidadStock} · te alcanzan ${dias} ${dias === 1 ? "día" : "días"}`,
    alerta: dias <= 5,
  };
}

/** Hora de una toma nueva: 12 h después si hay una sola, 6 h si ya hay varias (tope 23). */
export function siguienteHora(horas: string[]): string {
  const ultima = parseInt((horas[horas.length - 1] ?? "08:00").slice(0, 2), 10);
  const hora = Math.min(23, ultima + (horas.length === 1 ? 12 : 6));
  return `${String(hora).padStart(2, "0")}:00`;
}

/** Texto descriptivo de `frecuencia`, derivado de la cantidad de tomas. */
export function frecuenciaDeTomas(cantidad: number): string {
  return `${Math.max(1, cantidad)}x día`;
}
