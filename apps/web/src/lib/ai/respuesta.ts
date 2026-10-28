import type { MiembroFamilia } from "@/lib/familia/tipos";

// Lógica PURA (sin server-only, sin I/O) para leer lo que escribió el usuario:
// si responde sí/no a una confirmación y si nombra a un familiar. Vive aparte de
// lib/chat/pedidos.ts para poder probarla sin Supabase.

/** Minúsculas, sin tildes, espacios colapsados. */
export function normTexto(valor: unknown): string {
  if (valor === undefined || valor === null) return "";
  return String(valor)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const PARENTESCOS =
  "mama|papa|madre|padre|abuel[oa]|abu|hij[oa]|ti[oa]|herman[oa]|espos[oa]|marido|pareja|suegr[oa]|niet[oa]|prim[oa]|cunad[oa]|yerno|nuera|nena|nene|bebe|viej[oa]|novi[oa]|familiar";

// Cualquier negación en la respuesta (en cualquier parte) la vuelve un no.
const NEGACION = /\b(no|nop|nope|nunca|jamas|cancel\w*|nada|tampoco|ni)\b/;
const AFIRMACION =
  /^(si|sip|sii+|dale|ok|okey|okay|confirmo|claro|de una|correcto|exacto|listo|hacelo|agregalo|cargalo|por supuesto|obvio|aja|afirmativo|perfecto|genial)\b/;
const PARA_MI = new RegExp(`\\bpara mi\\b(?! (${PARENTESCOS})\\b)`);

/**
 * Clasifica el mensaje ACTUAL del usuario como respuesta a "¿se lo cargo a X?".
 * - "no": hay una negación ("no", "nunca", "cancelar", "mejor no", "ni loca"...)
 *   al principio, o un "para mí" (un rechazo gana siempre, incluso "sí, para mí").
 * - "si": mensaje afirmativo SIN ninguna negación, o "para <persona>" exacto.
 * - "otro": todo lo demás, incluido un sí con una negación más adelante en una
 *   frase larga ("sí, y no te olvides del horario"): no autoriza ni cancela.
 * `personas` son los nombres reales de las personas a cargo: "sí, para Mi Nena"
 * (perfil llamado "Mi Nena") es un sí, no un "para mí".
 */
export function clasificarRespuesta(texto: string, personas: string | readonly string[] | null): "si" | "no" | "otro" {
  const t = normTexto(texto)
    .replace(/[¿?¡!.,;:()"…]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return "otro";
  const nombres = (Array.isArray(personas) ? personas : personas ? [personas as string] : [])
    .map(normTexto)
    .filter(Boolean)
    // Los más largos primero: "mi nena grande" antes que "mi nena".
    .sort((a, b) => b.length - a.length);
  // "para <nombre real>" se reemplaza por un marcador para que "para mi nena" no se lea como "para mí".
  let sinNombres = t;
  for (const n of nombres) sinNombres = sinNombres.split(`para ${n}`).join("para_persona");

  const cabeza = sinNombres.split(" ").slice(0, 4).join(" ");
  if (NEGACION.test(cabeza)) return "no";
  const afirma = AFIRMACION.test(sinNombres);
  if (NEGACION.test(sinNombres)) return afirma ? "otro" : "no";
  if (PARA_MI.test(sinNombres)) return "no";
  if (afirma) return "si";
  if (nombres.some((n) => t === `para ${n}`)) return "si";
  return "otro";
}

const MENCION_GENERICA = new RegExp(`\\b(mi|mis|su|sus)\\s+(${PARENTESCOS})\\b|\\b(para|de|a) (la|el) (${PARENTESCOS})\\b`);

/**
 * ¿El mensaje nombra a un familiar? Por nombre de pila / nombre completo o
 * relación de alguien de `familia`, o por un parentesco genérico con posesivo
 * ("mi mamá", "su papá"). Devuelve los miembros que coinciden por nombre/relación;
 * si solo hay mención genérica, `candidatos` son todos los miembros (la app
 * pregunta cuál). Nunca decide el destino: solo permite frenar una escritura sin
 * persona_id para preguntar "¿para vos o para X?".
 */
export function mencionaFamiliar(
  mensaje: string,
  familia: readonly MiembroFamilia[]
): { menciona: boolean; candidatos: MiembroFamilia[] } {
  const t = normTexto(mensaje).replace(/[¿?¡!.,;:()"…]/g, " ").replace(/\s+/g, " ");
  if (!t || familia.length === 0) return { menciona: false, candidatos: [] };
  const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const porNombre = familia.filter((f) => {
    const nombre = normTexto(f.nombre);
    const pila = nombre.split(" ")[0] ?? "";
    const relacion = normTexto(f.relacion);
    const hay = (palabra: string) => palabra.length >= 3 && new RegExp(`\\b${escapar(palabra)}\\b`).test(t);
    return hay(nombre) || hay(pila) || hay(relacion);
  });
  if (porNombre.length > 0) return { menciona: true, candidatos: porNombre };
  if (MENCION_GENERICA.test(t)) return { menciona: true, candidatos: [...familia] };
  return { menciona: false, candidatos: [] };
}
