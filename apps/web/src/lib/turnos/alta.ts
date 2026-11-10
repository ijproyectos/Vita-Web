// Lógica pura del alta de turno (V7): buscador de especialidad, credencial que
// sugiere "Qué hay que llevar", calendario y pasos del selector de hora.

export const CATALOGO_ESPECIALIDADES: [string, string][] = [
  ["Clínica", "clínico médico de cabecera generalista control chequeo"],
  ["Cardiología", "corazón presión electro"],
  ["Laboratorio", "análisis sangre extracción orina"],
  ["Estudio / imágenes", "ecografía radiografía placa resonancia tomografía densitometría"],
  ["Odontología", "dientes dentista muela"],
  ["Kinesiología", "kine rehabilitación espalda"],
  ["Traumatología", "huesos rodilla cadera fractura"],
  ["Oftalmología", "ojos vista anteojos"],
  ["Dermatología", "piel lunares"],
  ["Ginecología", "mamografía papanicolau"],
  ["Urología", "próstata"],
  ["Endocrinología", "diabetes tiroides azúcar"],
  ["Neurología", "cabeza memoria"],
  ["Gastroenterología", "estómago colonoscopía endoscopía"],
  ["Neumonología", "pulmones respirar"],
  ["Otorrinolaringología", "oídos garganta audífono"],
  ["Psicología", "terapia salud mental"],
  ["Psiquiatría", "salud mental"],
  ["Geriatría", "adulto mayor"],
  ["Nutrición", "dieta peso"],
  ["Fonoaudiología", "habla voz"],
];

function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

/** Hasta 4 especialidades por nombre o palabra clave; `por` = la palabra que coincidió. */
export function sugerirEspecialidades(texto: string): { etiqueta: string; por: string | null }[] {
  const q = normalizar(texto);
  if (!q) return [];
  return CATALOGO_ESPECIALIDADES.flatMap<{ etiqueta: string; por: string | null }>(([etiqueta, claves]) => {
    if (normalizar(etiqueta).includes(q)) return [{ etiqueta, por: null }];
    const palabra = claves.split(" ").find((c) => normalizar(c).startsWith(q));
    return palabra ? [{ etiqueta, por: palabra }] : [];
  }).slice(0, 4);
}

/** "Credencial de X" según la obra social; null si se atiende particular. */
export function credencialDeObraSocial(obraSocial: string | null | undefined): string | null {
  const obra = (obraSocial ?? "").trim();
  if (/particular/i.test(obra)) return null;
  return `Credencial de ${obra ? obra.replace(/\s+\d+$/, "") : "obra social"}`;
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

export function tituloMes(anio: number, mes: number): string {
  const nombre = MESES[mes];
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${anio}`;
}

/** Celdas de un mes con la semana empezando en lunes; null = hueco antes del día 1. */
export function celdasDelMes(anio: number, mes: number): (string | null)[] {
  const primero = new Date(Date.UTC(anio, mes, 1));
  const huecos = (primero.getUTCDay() + 6) % 7;
  const dias = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
  const iso = (d: number) => `${anio}-${String(mes + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return [...Array<null>(huecos).fill(null), ...Array.from({ length: dias }, (_, i) => iso(i + 1))];
}

export function etiquetaDiaTurno(fecha: string): string {
  const [a, m, d] = fecha.split("-").map(Number);
  return `${DIAS[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]} ${d} de ${MESES[m - 1]}`;
}

export function pasoHora(hora: number, direccion: 1 | -1): number {
  return (hora + direccion + 24) % 24;
}

/** De a 5 minutos: una hora que no era múltiplo de 5 se redondea al moverla. */
export function pasoMinutos(minutos: number, direccion: 1 | -1): number {
  return (Math.round(minutos / 5) * 5 + (direccion === 1 ? 5 : 55)) % 60;
}
