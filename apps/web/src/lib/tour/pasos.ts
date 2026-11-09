// Recorrido de la primera vez (VitaApp V7, `tourSteps`). Lógica pura.

export const PARAM_TOUR = "tour";
export const DESTINO_CON_TOUR = `/app?${PARAM_TOUR}=1`;
export const CLAVE_TOUR_VISTO = "vita_tour_visto";

export type PasoTour = {
  /** Valor de `data-tour` del elemento a resaltar; null = cierre, sin resaltar. */
  clave: string | null;
  radio: string;
  margen: number;
  eyebrow: string;
  titulo: string;
  texto: string;
};

export function pasosTour(nombre: string): PasoTour[] {
  return [
    { clave: "vita", radio: "999px", margen: 4, eyebrow: "Hola, soy vita", titulo: "Contame qué hay que recordar", texto: "Escribime o hablame como a una persona. Yo armo la rutina." },
    { clave: "hoy", radio: "22px", margen: 4, eyebrow: "Tu día", titulo: "Así va el día", texto: "Tocá la tarjeta para marcar lo que ya tomaste." },
    { clave: "empezar", radio: "26px", margen: 4, eyebrow: "Empecemos", titulo: "Cargá tu primer remedio", texto: "Con eso armo tu día y te aviso a cada hora." },
    { clave: "perfil", radio: "14px", margen: 8, eyebrow: "Tu familia", titulo: "Pasá de un perfil a otro", texto: "Tocá tu nombre para ver la rutina de quien cuidás." },
    { clave: "bell", radio: "999px", margen: 4, eyebrow: "Avisos", titulo: "Si alguien no confirma, te aviso", texto: "Todo lo que pasó hoy, tuyo y de tu familia, queda acá." },
    { clave: "rutina", radio: "18px", margen: 2, eyebrow: "Rutina", titulo: "Remedios y turnos", texto: "Lo de hoy y lo que viene en los próximos días." },
    { clave: "salud", radio: "18px", margen: 2, eyebrow: "Mi Salud", titulo: "Toda la salud en un lugar", texto: "Mediciones, estudios y la historia clínica de cada uno." },
    { clave: null, radio: "16px", margen: 0, eyebrow: "Todo listo", titulo: `Listo, ${nombre}. Ya estoy recordando por vos.`, texto: "Cuando quieras algo, tocá el botón del centro." },
  ];
}

/** Solo los pasos cuyo elemento está en pantalla, más el cierre. */
export function pasosVisibles(pasos: PasoTour[], existe: (clave: string) => boolean): PasoTour[] {
  return pasos.filter((p) => p.clave === null || existe(p.clave));
}

export type Caja = { x: number; y: number; w: number; h: number };

const ALTO_GLOBO = 170;
const SEPARACION = 16;
const BORDE = 16;

/** Dónde va el globo: debajo del elemento si está en la mitad de arriba, si no, encima. */
export function posicionGlobo(caja: Caja | null, altoVentana: number): { top: number; flechaArriba: boolean | null } {
  if (!caja) return { top: Math.max(BORDE, altoVentana / 2 - ALTO_GLOBO / 2), flechaArriba: null };
  const abajo = caja.y + caja.h / 2 < altoVentana / 2;
  const top = abajo ? caja.y + caja.h + SEPARACION : caja.y - ALTO_GLOBO - SEPARACION;
  return { top: Math.max(BORDE, Math.min(altoVentana - ALTO_GLOBO - BORDE, top)), flechaArriba: abajo };
}
