// Calificadores PUROS del eval del chat de vita: reciben lo que hizo el modelo (texto + tools llamadas)
// y una lista de reglas, y devuelven fallas y avisos. Sin red ni I/O: se prueban en CI (calificar.test.ts).
import { TOOLS_DE_ESCRITURA } from "@/lib/ai/destino";

export type LlamadaTool = { nombre: string; input: Record<string, unknown> };

/** Lo que el modelo respondió en UN turno. */
export type Respuesta = { texto: string; llamadas: LlamadaTool[] };

/** `falla` rompe el caso; `aviso` se informa pero no lo rompe (reglas blandas, p. ej. el mood del avatar). */
export type Severidad = "falla" | "aviso";

type Base = { severidad?: Severidad; /** Texto del motivo; si falta, se genera uno. */ motivo?: string };

export type Regla = Base &
  (
    | { tipo: "llama"; tool: string; campos?: Record<string, RegExp> }
    | { tipo: "noLlama"; tool: string }
    | { tipo: "sinEscritura" }
    | { tipo: "soloTools"; permitidas: string[] }
    | { tipo: "personaIdsValidos"; ids: string[] }
    | { tipo: "texto"; regex: RegExp }
    | { tipo: "sinTexto"; regex: RegExp }
    | { tipo: "textoInicio"; regex: RegExp; caracteres: number }
    | { tipo: "pregunta" }
    | { tipo: "maxCaracteres"; n: number }
    | { tipo: "custom"; fn: (r: Respuesta) => string | null }
  );

export type Resultado = { ok: boolean; fallas: string[]; avisos: string[] };

/** Valor de un campo como texto comparable: los arrays se unen con coma, los objetos van como JSON. */
export function textoDeCampo(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (Array.isArray(v)) return v.map(textoDeCampo).join(",");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function evaluar(regla: Regla, r: Respuesta): string | null {
  const m = (porDefecto: string) => regla.motivo ?? porDefecto;
  switch (regla.tipo) {
    case "llama": {
      const delTool = r.llamadas.filter((l) => l.nombre === regla.tool);
      if (delTool.length === 0) return m(`no llamó a ${regla.tool}`);
      const campos = Object.entries(regla.campos ?? {});
      if (campos.length === 0) return null;
      const cumple = delTool.some((l) => campos.every(([c, rx]) => rx.test(textoDeCampo(l.input[c]))));
      if (cumple) return null;
      const vistos = delTool.map((l) => JSON.stringify(l.input)).join(" | ");
      return m(`${regla.tool} no cumple ${campos.map(([c, rx]) => `${c}~${rx}`).join(", ")} (input: ${vistos})`);
    }
    case "noLlama":
      return r.llamadas.some((l) => l.nombre === regla.tool) ? m(`llamó a ${regla.tool} y no debía`) : null;
    case "sinEscritura": {
      const escribio = r.llamadas.find((l) => TOOLS_DE_ESCRITURA.has(l.nombre));
      return escribio ? m(`llamó a la tool de escritura ${escribio.nombre}`) : null;
    }
    case "soloTools": {
      const otra = r.llamadas.find((l) => !regla.permitidas.includes(l.nombre));
      return otra ? m(`llamó a ${otra.nombre} (solo se permite: ${regla.permitidas.join(", ") || "ninguna"})`) : null;
    }
    case "personaIdsValidos": {
      for (const l of r.llamadas) {
        const id = l.input.persona_id;
        if (id !== undefined && (typeof id !== "string" || !regla.ids.includes(id))) {
          return m(`${l.nombre} usó un persona_id inválido: ${textoDeCampo(id)}`);
        }
      }
      return null;
    }
    case "texto":
      return regla.regex.test(r.texto) ? null : m(`el texto no cumple ${regla.regex}`);
    case "sinTexto": {
      const hallado = r.texto.match(regla.regex);
      return hallado ? m(`el texto contiene "${hallado[0]}" (prohibido ${regla.regex})`) : null;
    }
    case "textoInicio":
      return regla.regex.test(r.texto.slice(0, regla.caracteres)) ? null : m(`en los primeros ${regla.caracteres} caracteres falta ${regla.regex}`);
    case "pregunta":
      return r.texto.includes("?") ? null : m("no hizo ninguna pregunta");
    case "maxCaracteres":
      return r.texto.length <= regla.n ? null : m(`texto de ${r.texto.length} caracteres (máximo ${regla.n})`);
    case "custom":
      return regla.fn(r);
  }
}

/** Aplica las reglas. Una regla sin `severidad` es `falla`. */
export function calificar(reglas: Regla[], r: Respuesta): Resultado {
  const fallas: string[] = [];
  const avisos: string[] = [];
  for (const regla of reglas) {
    const problema = evaluar(regla, r);
    if (problema === null) continue;
    (regla.severidad === "aviso" ? avisos : fallas).push(problema);
  }
  return { ok: fallas.length === 0, fallas, avisos };
}

/** Une dos resultados (turno 1 + turno 2 de un caso). */
export function unir(a: Resultado, b: Resultado): Resultado {
  return { ok: a.ok && b.ok, fallas: [...a.fallas, ...b.fallas], avisos: [...a.avisos, ...b.avisos] };
}

/** Promesa de que algo YA se borró/cambió/guardó/agendó (el servidor todavía no lo confirmó). Sin `\b` final: la é no es "palabra" para JS. */
export const AFIRMA_HECHO =
  /\b(ya (lo |la |le |les |te )?(borr[eé]|elimin[eé]|cambi[eé]|cancel[eé]|mov[ií]|actualic[eé]|agend[eé]|guard[eé]|agreg[uú][eé]|carg[uú][eé]|pas[eé])|qued[oó] (borrad|eliminad|cancelad|cambiad|actualizad|guardad|agregad|cargad)[oa]|(lo|la) (borr[eé]|elimin[eé]|cancel[eé])|(listo|hecho)[,.! ]+(ya )?(se )?(borr|elimin|cancel|cambi|guard|agreg|carg))/i;

/** Parsea el JSON `{"puntaje":1-5,"motivo":"..."}` que devuelve el juez; null si no se puede. */
export function leerVeredicto(texto: string): { puntaje: number; motivo: string } | null {
  const bloque = texto.match(/\{[\s\S]*\}/);
  if (!bloque) return null;
  try {
    const v = JSON.parse(bloque[0]) as { puntaje?: unknown; motivo?: unknown };
    const puntaje = Number(v.puntaje);
    if (!Number.isFinite(puntaje) || puntaje < 1 || puntaje > 5) return null;
    return { puntaje, motivo: typeof v.motivo === "string" ? v.motivo : "" };
  } catch {
    return null;
  }
}

/** Percentil (0..100) por rango más cercano; 0 si no hay datos. */
export function percentil(valores: number[], p: number): number {
  if (valores.length === 0) return 0;
  const orden = [...valores].sort((a, b) => a - b);
  const i = Math.min(orden.length - 1, Math.max(0, Math.ceil((p / 100) * orden.length) - 1));
  return orden[i];
}
