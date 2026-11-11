// "Losartan 500mg todos los martes, jueves y sabado a las 21hs" en el campo
// Nombre: lo detecta y propone separarlo en nombre, dosis, días y hora. PURO.
// Nunca cambia nada solo: el formulario muestra la sugerencia y la persona
// decide. Sin nada que separar devuelve null.
import type { DiaSemana } from "./tipos";

export type SugerenciaNombre = {
  nombre: string;
  /** "500 mg" */
  dosis: string | null;
  dias: DiaSemana[];
  /** "21:00" */
  hora: string | null;
};

const DIAS: Record<string, DiaSemana> = {
  lunes: "lunes",
  martes: "martes",
  miercoles: "miercoles",
  jueves: "jueves",
  viernes: "viernes",
  sabado: "sabado",
  sabados: "sabado",
  domingo: "domingo",
  domingos: "domingo",
};
const ORDEN: DiaSemana[] = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];

const RE_DOSIS = /(\d+(?:[.,]\d+)?)\s*(mg|mcg|ml|g|ui|gotas?|comprimidos?)\b/i;
const RE_HORA = /(?:a\s+las?\s+)?\b(\d{1,2})(?:[:.](\d{2}))?\s*(?:hs|h|horas)\b|\ba\s+las?\s+(\d{1,2})(?:[:.](\d{2}))?\b/i;
const RE_FRECUENCIA = /\b(todos\s+los|todas\s+las|cada|los|el|por\s+la|a\s+la)\b/i;

function sinTildes(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function sugerirSeparacion(texto: string): SugerenciaNombre | null {
  const original = texto.trim();
  if (original.length < 4) return null;
  const plano = sinTildes(original);

  const cortes: number[] = [];

  const mDosis = RE_DOSIS.exec(plano);
  let dosis: string | null = null;
  if (mDosis) {
    dosis = `${mDosis[1].replace(".", ",")} ${mDosis[2].toLowerCase()}`;
    cortes.push(mDosis.index);
  }

  const dias = new Set<DiaSemana>();
  const reDia = /\b(lunes|martes|miercoles|jueves|viernes|sabados?|domingos?)\b/gi;
  for (let m = reDia.exec(plano); m; m = reDia.exec(plano)) {
    dias.add(DIAS[m[1].toLowerCase()]);
    cortes.push(m.index);
  }

  const mHora = RE_HORA.exec(plano);
  let hora: string | null = null;
  if (mHora) {
    const h = Number(mHora[1] ?? mHora[3]);
    const min = Number(mHora[2] ?? mHora[4] ?? "0");
    if (h <= 23 && min <= 59) {
      hora = `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
      cortes.push(mHora.index);
    }
  }

  if (!dosis && dias.size === 0 && !hora) return null;

  // El nombre es lo que viene antes del primer dato, sin "todos los", comas ni guiones al final.
  let nombre = original.slice(0, Math.min(...cortes));
  for (let i = 0; i < 3; i++) {
    nombre = nombre.replace(/[\s,.;:\-–(]+$/, "");
    const fin = RE_FRECUENCIA.exec(sinTildes(nombre).split(/\s+/).slice(-2).join(" "));
    if (!fin) break;
    nombre = nombre.slice(0, nombre.length - fin[0].length);
  }
  nombre = nombre.trim();
  if (!nombre || nombre === original) return null;

  return { nombre, dosis, dias: ORDEN.filter((d) => dias.has(d)), hora };
}
