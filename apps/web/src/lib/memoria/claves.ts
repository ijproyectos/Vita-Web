import { limpiarDato } from "@/lib/ai/limpiar";
import { DIAS_VIGENCIA_PASAJERO, type SobreTipo, type TipoMemoria } from "./tipos";

// Lógica pura de los recuerdos (sin I/O ni `server-only`): normalización de la clave de tema, a quién
// se refiere un recuerdo y vencimiento de los pasajeros. Separada para poder testearla cuando haya runner.

/** Largo máximo del texto de un recuerdo. */
export const MAX_TEXTO_MEMORIA = 200;
const MAX_CLAVE = 48;
const MAX_NOMBRE = 40;

function sinTildes(valor: string): string {
  return valor.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Tema estable en snake_case: minúsculas, sin tildes, solo [a-z0-9_]. null si no queda nada. */
export function normalizarClave(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const clave = sinTildes(valor)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, MAX_CLAVE)
    .replace(/_+$/g, "");
  return clave || null;
}

/** Texto del recuerdo: espacios colapsados. null si está vacío; `largo` si pasa el tope (se le pide acortar al modelo). */
export function normalizarTexto(valor: unknown): { ok: true; texto: string } | { ok: false; motivo: "vacio" | "largo" } {
  if (typeof valor !== "string") return { ok: false, motivo: "vacio" };
  const texto = valor.replace(/\s+/g, " ").trim();
  if (!texto) return { ok: false, motivo: "vacio" };
  if (texto.length > MAX_TEXTO_MEMORIA) return { ok: false, motivo: "largo" };
  return { ok: true, texto };
}

export function normalizarTipo(valor: unknown): TipoMemoria {
  return valor === "pasajero" ? "pasajero" : "estable";
}

/** Un pasajero vence a los 3 días. */
export function vencimientoPasajero(ahora: Date = new Date()): string {
  return new Date(ahora.getTime() + DIAS_VIGENCIA_PASAJERO * 24 * 60 * 60 * 1000).toISOString();
}

/** Sobre quién es un recuerdo, ya resuelto. */
export type SobreResuelto =
  | { tipo: "yo"; perfilId: null; nombre: null }
  | { tipo: "familiar"; perfilId: string; nombre: string }
  | { tipo: "otro"; perfilId: null; nombre: string };

type MiembroMinimo = { id: string; nombre: string };

const ALIAS_YO = new Set(["yo", "vos", "mi", "me", "yo mismo", "yo misma", "quien chatea", "usuario"]);

function nombreComparable(valor: string): string {
  return sinTildes(valor).toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * "Sobre quién" a partir de lo que mande el modelo: 'yo' (o el id del propio usuario), el persona_id exacto
 * de la lista de Personas, el nombre de alguien de esa lista, o el nombre de otra persona. Los ids que no
 * son del usuario ni de la familia no se aceptan como id (se tratan como nombre solo si no parecen un uuid).
 */
export function resolverSobre(sobre: unknown, usuarioId: string, familia: MiembroMinimo[]): SobreResuelto | null {
  if (typeof sobre !== "string") return null;
  const crudo = sobre.trim();
  if (!crudo) return null;
  if (crudo === usuarioId || ALIAS_YO.has(nombreComparable(crudo))) return { tipo: "yo", perfilId: null, nombre: null };

  const porId = familia.find((f) => f.id === crudo);
  if (porId) return { tipo: "familiar", perfilId: porId.id, nombre: limpiarDato(porId.nombre, MAX_NOMBRE) };

  // Un id que no es del usuario ni de la familia no se inventa como nombre.
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(crudo)) return null;

  const nombre = limpiarDato(crudo, MAX_NOMBRE);
  if (!nombre) return null;
  const porNombre = familia.filter((f) => nombreComparable(f.nombre) === nombreComparable(nombre));
  // Dos personas con el mismo nombre: ambiguo, mejor tratarlo como "otro" que adivinar cuál.
  if (porNombre.length === 1) return { tipo: "familiar", perfilId: porNombre[0].id, nombre: limpiarDato(porNombre[0].nombre, MAX_NOMBRE) };
  return { tipo: "otro", perfilId: null, nombre };
}

/** Misma expresión que el índice único de 035: 'yo', 'perfil:<id>' o 'nombre:<minúsculas>'. */
export function claveSobre(m: { sobre_tipo: SobreTipo; sobre_perfil_id: string | null; sobre_nombre: string | null }): string {
  if (m.sobre_tipo === "yo") return "yo";
  if (m.sobre_perfil_id) return `perfil:${m.sobre_perfil_id}`;
  return `nombre:${(m.sobre_nombre ?? "").toLowerCase()}`;
}

export function claveSobreResuelto(s: SobreResuelto): string {
  return claveSobre({ sobre_tipo: s.tipo, sobre_perfil_id: s.perfilId, sobre_nombre: s.nombre });
}

/** Nombre para mostrar de a quién se refiere un recuerdo; null si es la propia persona. */
export function etiquetaSobre(
  m: { sobre_tipo: SobreTipo; sobre_perfil_id: string | null; sobre_nombre: string | null },
  familia: MiembroMinimo[]
): string | null {
  if (m.sobre_tipo === "yo") return null;
  const miembro = m.sobre_perfil_id ? familia.find((f) => f.id === m.sobre_perfil_id) : undefined;
  const nombre = miembro?.nombre ?? m.sobre_nombre;
  return nombre ? limpiarDato(nombre, MAX_NOMBRE) : "otra persona";
}

/** Escapa % _ \ para un ilike con el nombre literal. */
export function escaparLike(valor: string): string {
  return valor.replace(/[\\%_]/g, (c) => `\\${c}`);
}
