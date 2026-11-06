// Estado de la charla del onboarding (/onboarding/conversar), PURO.
//
// Antes cada paso encadenaba al siguiente con una pregunta fija y los datos
// vivían en useState sueltos: cualquier camino que volvía a pasar por un paso
// (recargar la página, "Sumarme yo" después de cargar a otra persona, el
// formulario alternativo) repetía preguntas ya contestadas. Ahora hay UN
// estado por persona (la que se cuida y "vos") y UNA función, `proximoPaso`,
// que decide qué falta preguntar a partir de lo que ya se sabe.
import type { Nacimiento } from "./nacimiento";

export type PasoConversacion = "nacimiento" | "condiciones" | "alergias" | "remedios" | "turnos" | "mediciones";

export type EstadoPersona = {
  /** Lo que se sabe del nacimiento (null = nunca se preguntó). */
  nacimiento: Nacimiento | null;
  /** Se contestó o se salteó explícitamente: no se vuelve a preguntar. */
  nacimientoRespondido: boolean;
  /** null = sin responder; [] = dijo que no tiene. */
  condiciones: string[] | null;
  alergias: string[] | null;
  remediosRespondido: boolean;
  turnosRespondido: boolean;
  medicionesRespondido: boolean;
};

export function estadoVacio(): EstadoPersona {
  return {
    nacimiento: null,
    nacimientoRespondido: false,
    condiciones: null,
    alergias: null,
    remediosRespondido: false,
    turnosRespondido: false,
    medicionesRespondido: false,
  };
}

function unir(a: string[] | null, b: string[] | null | undefined): string[] | null {
  if (b === null || b === undefined) return a;
  const base = a ?? [];
  const vistos = new Set(base.map((x) => x.toLowerCase()));
  return [...base, ...b.filter((x) => !vistos.has(x.toLowerCase()))];
}

/**
 * Suma una respuesta nueva al estado. Lo ya respondido nunca se pisa con un
 * vacío: un `null`/`undefined` del parcial se ignora, las listas se unen sin
 * duplicados y un nacimiento "nada" no borra uno conocido. Un nacimiento más
 * completo (fecha) reemplaza a uno menos completo (año/edad).
 */
export function mezclarEstado(actual: EstadoPersona, parcial: Partial<EstadoPersona>): EstadoPersona {
  const nac = parcial.nacimiento ?? null;
  const nacimiento = nac && nac.tipo !== "nada" && nac.tipo !== "invalido" && pesoNacimiento(nac) >= pesoNacimiento(actual.nacimiento) ? nac : actual.nacimiento;
  return {
    nacimiento,
    nacimientoRespondido: actual.nacimientoRespondido || Boolean(parcial.nacimientoRespondido),
    condiciones: unir(actual.condiciones, parcial.condiciones),
    alergias: unir(actual.alergias, parcial.alergias),
    remediosRespondido: actual.remediosRespondido || Boolean(parcial.remediosRespondido),
    turnosRespondido: actual.turnosRespondido || Boolean(parcial.turnosRespondido),
    medicionesRespondido: actual.medicionesRespondido || Boolean(parcial.medicionesRespondido),
  };
}

function pesoNacimiento(n: Nacimiento | null): number {
  if (!n) return 0;
  if (n.tipo === "fecha") return 3;
  if (n.tipo === "solo-anio") return 2;
  if (n.tipo === "solo-edad") return 1;
  return 0;
}

/** Primer paso sin contestar, en el orden de la charla; null = no falta nada. */
export function proximoPaso(e: EstadoPersona): PasoConversacion | null {
  if (!e.nacimientoRespondido) return "nacimiento";
  if (e.condiciones === null) return "condiciones";
  if (e.alergias === null) return "alergias";
  if (!e.remediosRespondido) return "remedios";
  if (!e.turnosRespondido) return "turnos";
  if (!e.medicionesRespondido) return "mediciones";
  return null;
}

type PerfilConocido = {
  fecha_nacimiento?: string | null;
  edad_rango?: string | null;
  condiciones?: { label: string }[] | null;
  alergias?: string[] | null;
  mediciones_en_casa?: string | null;
};

/**
 * Estado inicial de la cuenta propia a partir de lo ya guardado (recargar la
 * página no tiene que repetir preguntas). "Ninguna" no deja rastro en la base,
 * así que condiciones/alergias vacías cuentan como sin responder.
 */
export function estadoDesdePerfil(
  perfil: PerfilConocido | null,
  extras: { tieneRemedios: boolean; tieneTurnos: boolean },
  hoyISO: string
): EstadoPersona {
  let estado = estadoVacio();
  if (!perfil) return estado;
  const fecha = perfil.fecha_nacimiento?.slice(0, 10);
  if (fecha) {
    const anio = Number(fecha.slice(0, 4));
    const hoy = Number(hoyISO.slice(0, 4));
    estado = mezclarEstado(estado, {
      nacimiento: { tipo: "fecha", fecha, edad: hoy - anio },
      nacimientoRespondido: true,
    });
  } else if (perfil.edad_rango) {
    // Hay un rango/año declarado: alcanza para no volver a preguntar.
    estado = { ...estado, nacimientoRespondido: true };
  }
  const condiciones = (perfil.condiciones ?? []).map((c) => c.label).filter(Boolean);
  if (condiciones.length > 0) estado = mezclarEstado(estado, { condiciones });
  if ((perfil.alergias ?? []).length > 0) estado = mezclarEstado(estado, { alergias: perfil.alergias ?? [] });
  if (extras.tieneRemedios) estado = { ...estado, remediosRespondido: true };
  if (extras.tieneTurnos) estado = { ...estado, turnosRespondido: true };
  if (perfil.mediciones_en_casa) estado = { ...estado, medicionesRespondido: true };
  return estado;
}

// --- Listas editables (remedios, turnos) -----------------------------------

/** Un elemento de una lista que se confirma toda junta antes de guardar. */
export type ItemLista<T> = { id: string; datos: T; guardado: boolean; error?: string };

export function agregarItem<T>(lista: ItemLista<T>[], id: string, datos: T): ItemLista<T>[] {
  return [...lista, { id, datos, guardado: false }];
}

/** Quita un elemento todavía no guardado; uno ya guardado se queda (ya existe en la base). */
export function quitarItem<T>(lista: ItemLista<T>[], id: string): ItemLista<T>[] {
  return lista.filter((i) => i.id !== id || i.guardado);
}

export function marcarResultado<T>(lista: ItemLista<T>[], id: string, resultado: { ok: true } | { ok: false; error: string }): ItemLista<T>[] {
  return lista.map((i) => (i.id !== id ? i : resultado.ok ? { ...i, guardado: true, error: undefined } : { ...i, error: resultado.error }));
}

export function pendientesDeGuardar<T>(lista: ItemLista<T>[]): ItemLista<T>[] {
  return lista.filter((i) => !i.guardado);
}

// --- Cantidad de remedios -----------------------------------------------------

const NUMEROS: Record<string, number> = { un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10 };
export const MAXIMO_REMEDIOS_POR_CHARLA = 12;

function capitalizar(texto: string): string {
  const t = texto.trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** "Losartán, Metformina y Aspirina" -> 3 nombres, sin repetidos y con mayúscula. */
export function separarNombresRemedios(texto: string): string[] {
  const vistos = new Set<string>();
  const nombres: string[] = [];
  for (const crudo of texto.split(/[,;\n]|\s+y\s+|\s+e\s+/i)) {
    const nombre = capitalizar(crudo.replace(/^\s*(el|la|los|las)\s+/i, ""));
    const clave = nombre.toLowerCase();
    if (!nombre || vistos.has(clave)) continue;
    vistos.add(clave);
    nombres.push(nombre);
  }
  return nombres.slice(0, MAXIMO_REMEDIOS_POR_CHARLA);
}

export type LecturaCantidad = { tipo: "cantidad"; total: number } | { tipo: "lista"; nombres: string[] } | { tipo: "ilegible" };

/** Respuesta a "¿Cuántos remedios toma?": un número ("3", "dos") o directamente la lista de nombres. */
export function leerCantidadRemedios(texto: string): LecturaCantidad {
  const t = texto.trim().toLowerCase().replace(/[.!¡¿?]/g, "");
  if (!t) return { tipo: "ilegible" };
  const numero = t.match(/^(\d{1,2})(?:\s+(?:remedios?|medicamentos?|pastillas?))?$/) ?? t.match(/^(un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)(?:\s+(?:remedios?|medicamentos?))?$/);
  if (numero) {
    const total = /^\d/.test(numero[1]) ? Number(numero[1]) : NUMEROS[numero[1]];
    return total >= 1 && total <= MAXIMO_REMEDIOS_POR_CHARLA ? { tipo: "cantidad", total } : { tipo: "ilegible" };
  }
  if (/\d/.test(t)) return { tipo: "ilegible" };
  const nombres = separarNombresRemedios(texto);
  return nombres.length > 0 ? { tipo: "lista", nombres } : { tipo: "ilegible" };
}
