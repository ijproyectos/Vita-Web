// Reglas de las observaciones de vita (etapa 1, sin IA). Cada regla es una función PURA sobre datos ya leídos:
// no toca la base, no mira el reloj (la fecha y la hora AR llegan en `DatosPersonaObs`) y devuelve observaciones
// nuevas. Los umbrales viven en `constantes.ts`. Los textos salen de plantillas con números y nombres que ya están
// en los datos de la persona (remedios, estudios, especialidades): nunca texto libre de otro usuario.
// Sin `server-only`: lo usan el cron, las pantallas y los tests.

import { consumoDeToma, esForma } from "@/lib/medicamentos/forma";
import { normalizarLlevar } from "@/lib/turnos/tipos";
import { fechaEnAR } from "@/lib/tiempo-ar";
import {
  ESTUDIO_VENTANA_DIAS,
  FAMILIA_SIN_TOMAS_DIAS,
  FRASE_MEDICO,
  GLUCEMIA_ALTA,
  GLUCEMIA_BAJA,
  GLUCEMIA_MEDICIONES_MINIMAS,
  GLUCEMIA_VENTANA_DIAS,
  MEDICION_PENDIENTE_DIAS,
  PRESION_DIASTOLICA_ALTA,
  PRESION_MEDICIONES_MINIMAS,
  PRESION_SISTOLICA_ALTA,
  PRESION_VENTANA_DIAS,
  SALTEADAS_MINIMAS,
  SALTEADAS_VENTANA_DIAS,
  STOCK_DIAS_MAXIMOS,
  TRATAMIENTO_TERMINA_DIAS,
  TURNO_CERCA_DIAS,
  VIGENCIA_DIAS,
} from "./constantes";
import type { DatosPersonaObs, MedicamentoObs, ObservacionNueva } from "./tipos";

// --- Fechas (calendario de Argentina; sin horario de verano, un día son 24 h exactas) ----------------------------

const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
// `dias_recurrentes` va sin tildes.
const DIAS_SIN_TILDE = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];

function aUTC(fecha: string): number {
  const [a, m, d] = fecha.split("-").map(Number);
  return Date.UTC(a, m - 1, d);
}

/** "YYYY-MM-DD" más `n` días (n puede ser negativo). */
export function sumarDias(fecha: string, n: number): string {
  return new Date(aUTC(fecha) + n * 86_400_000).toISOString().slice(0, 10);
}

/** Días entre dos fechas ("b" menos "a"). */
export function diasEntre(a: string, b: string): number {
  return Math.round((aUTC(b) - aUTC(a)) / 86_400_000);
}

function indiceDia(fecha: string): number {
  return new Date(aUTC(fecha)).getUTCDay();
}

/** Semana ISO "YYYY-Www" de una fecha: parte de la clave de dedupe de las observaciones semanales. */
export function semanaISO(fecha: string): string {
  const d = new Date(aUTC(fecha));
  const dia = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dia);
  const inicioAnio = Date.UTC(d.getUTCFullYear(), 0, 1);
  const semana = Math.ceil(((d.getTime() - inicioAnio) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(semana).padStart(2, "0")}`;
}

/** Último instante (ISO, UTC) de un día AR. */
export function finDelDia(fecha: string): string {
  return new Date(`${fecha}T23:59:59-03:00`).toISOString();
}

function fechaDeInstante(iso: string): string {
  return fechaEnAR(new Date(iso));
}

/** Texto de cuándo es una fecha respecto de hoy: "hoy", "mañana", "pasado mañana", "el jueves". */
export function cuando(hoy: string, fecha: string): string {
  const n = diasEntre(hoy, fecha);
  if (n === 0) return "hoy";
  if (n === 1) return "mañana";
  if (n === 2) return "pasado mañana";
  return `el ${DIAS_SEMANA[indiceDia(fecha)]}`;
}

// --- Texto seguro ------------------------------------------------------------------------------------------------

/** Nombre de un dato (remedio, especialidad, valor de un estudio) sin control, comillas ni `<>`, acotado. */
export function textoSeguro(valor: string | null | undefined, max = 40): string {
  return (valor ?? "")
    .replace(/[\p{Cc}\p{Zl}\p{Zp}"<>`]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function primerNombre(nombre: string): string {
  return textoSeguro(nombre).split(" ")[0] || "Tu familiar";
}

function slug(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function vigenteHasta(hoy: string): string {
  return finDelDia(sumarDias(hoy, VIGENCIA_DIAS));
}

// --- Dosis programadas -------------------------------------------------------------------------------------------

/** ¿La toma de `m` estaba programada ese día? Día de la semana, alta y fin del tratamiento. */
function programadaEn(m: MedicamentoObs, fecha: string): boolean {
  if (m.dias_recurrentes.length > 0 && !m.dias_recurrentes.includes(DIAS_SIN_TILDE[indiceDia(fecha)])) return false;
  if (fechaDeInstante(m.created_at) > fecha) return false;
  if (m.fecha_fin && fecha > m.fecha_fin.slice(0, 10)) return false;
  return true;
}

/** Fechas "con marca" (tomada o "No la tomé"), por medicamento. */
function marcasPorMedicamento(datos: DatosPersonaObs): Set<string> {
  const marcas = new Set<string>();
  for (const t of datos.tomas) if (t.tomado || t.omitida_at) marcas.add(`${t.medicamento_id}|${t.fecha}`);
  return marcas;
}

// --- 1. Stock por terminarse ---------------------------------------------------------------------------------------

function consumoPorToma(m: MedicamentoObs, pastillasPorToma: number): number {
  if (m.cantidad_por_toma === null) return pastillasPorToma;
  return consumoDeToma(esForma(m.forma) ? m.forma : "pastilla", m.cantidad_por_toma);
}

function consumoDiario(m: MedicamentoObs, pastillasPorToma: number): number {
  const frecuencia = m.dias_recurrentes.length === 0 ? 1 : Math.min(7, m.dias_recurrentes.length) / 7;
  return consumoPorToma(m, pastillasPorToma) * frecuencia;
}

export function reglaStockBajoDias(d: DatosPersonaObs): ObservacionNueva[] {
  const salida: ObservacionNueva[] = [];
  for (const inv of d.inventarios) {
    const filas = d.medicamentos.filter((m) => m.inventario_id === inv.id && (!m.fecha_fin || m.fecha_fin.slice(0, 10) >= d.hoy));
    if (filas.length === 0) continue; // sin tratamiento vigente: no hay nada que reponer
    const consumo = filas.reduce((suma, m) => suma + consumoDiario(m, inv.pastillas_por_toma), 0);
    if (!(consumo > 0)) continue;
    const dias = Math.floor(inv.stock / consumo);
    if (dias > STOCK_DIAS_MAXIMOS) continue;
    // Si todos terminan antes de que se acabe el stock, no hace falta reponer.
    if (filas.every((m) => m.fecha_fin)) {
      const ultimoFin = filas.map((m) => (m.fecha_fin as string).slice(0, 10)).sort().at(-1) as string;
      if (dias >= diasEntre(d.hoy, ultimoFin) + 1) continue;
    }
    const nombre = textoSeguro(inv.nombre);
    const alcanza = dias <= 0 ? "No alcanza ni para mañana" : dias === 1 ? "Alcanza para 1 día" : `Alcanza para unos ${dias} días`;
    salida.push({
      tipo: "stock_bajo_dias",
      severidad: "info",
      clave: `stock_bajo_dias:${inv.id}:${semanaISO(d.hoy)}`,
      titulo: `Queda poco de ${nombre}`,
      texto: `${alcanza} con lo que hay cargado. Conviene pedir la receta o reponerlo a tiempo.`,
      datos: { inventario_id: inv.id, dias, stock: inv.stock },
      href: "/app/pastillas",
      vigente_hasta: vigenteHasta(d.hoy),
    });
  }
  return salida;
}

// --- 2. Tomas salteadas en la misma franja ----------------------------------------------------------------------

const FRANJA: Record<string, string> = { mañana: "la mañana", mediodia: "el mediodía", tarde: "la tarde", noche: "la noche" };

export function reglaTomasSalteadas(d: DatosPersonaObs): ObservacionNueva[] {
  const marcas = marcasPorMedicamento(d);
  const porFranja = new Map<string, number>();
  for (let i = 1; i <= SALTEADAS_VENTANA_DIAS; i++) {
    const fecha = sumarDias(d.hoy, -i); // hoy no cuenta: todavía puede marcarse
    for (const m of d.medicamentos) {
      if (!programadaEn(m, fecha) || marcas.has(`${m.id}|${fecha}`)) continue;
      porFranja.set(m.momento_dia, (porFranja.get(m.momento_dia) ?? 0) + 1);
    }
  }
  const salida: ObservacionNueva[] = [];
  for (const [franja, cantidad] of porFranja) {
    if (cantidad < SALTEADAS_MINIMAS) continue;
    const etiqueta = FRANJA[franja] ?? "el mismo momento del día";
    salida.push({
      tipo: "tomas_salteadas",
      severidad: "info",
      clave: `tomas_salteadas:${franja}:${semanaISO(d.hoy)}`,
      titulo: `Tomas de ${etiqueta} sin marcar`,
      texto: `Hubo ${cantidad} tomas de ${etiqueta} sin marcar en los últimos ${SALTEADAS_VENTANA_DIAS} días. Si se olvidan seguido, puede ayudar cambiar el horario. ${FRASE_MEDICO}`,
      datos: { momento_dia: franja, cantidad },
      href: "/app/rutina",
      vigente_hasta: vigenteHasta(d.hoy),
    });
  }
  return salida;
}

// --- 3 y 4. Presión y glucemia -----------------------------------------------------------------------------------

function medicionesEnVentana(d: DatosPersonaObs, tipo: string, dias: number) {
  const desde = sumarDias(d.hoy, -(dias - 1));
  return d.mediciones.filter((m) => m.tipo === tipo && fechaDeInstante(m.medido_at) >= desde && fechaDeInstante(m.medido_at) <= d.hoy);
}

export function reglaPresionAlta(d: DatosPersonaObs): ObservacionNueva[] {
  const altas = medicionesEnVentana(d, "presion", PRESION_VENTANA_DIAS).filter(
    (m) => m.valor >= PRESION_SISTOLICA_ALTA || (m.valor_secundario ?? 0) >= PRESION_DIASTOLICA_ALTA
  );
  if (altas.length < PRESION_MEDICIONES_MINIMAS) return [];
  const sistolicaMax = Math.max(...altas.map((m) => m.valor));
  const diastolicaMax = Math.max(...altas.map((m) => m.valor_secundario ?? 0));
  return [
    {
      tipo: "presion_alta",
      severidad: "atencion",
      clave: `presion_alta:${semanaISO(d.hoy)}`,
      titulo: "Presión alta en varias mediciones",
      texto: `Tu presión estuvo alta (${PRESION_SISTOLICA_ALTA} de máxima o ${PRESION_DIASTOLICA_ALTA} de mínima, o más) ${altas.length} veces en los últimos ${PRESION_VENTANA_DIAS} días. ${FRASE_MEDICO}`,
      datos: { cantidad: altas.length, sistolica_maxima: sistolicaMax, diastolica_maxima: diastolicaMax },
      href: "/app/mi-salud/monitoreo",
      vigente_hasta: vigenteHasta(d.hoy),
    },
  ];
}

export function reglaGlucemiaFueraDeRango(d: DatosPersonaObs): ObservacionNueva[] {
  const todas = medicionesEnVentana(d, "glucemia", GLUCEMIA_VENTANA_DIAS);
  const altas = todas.filter((m) => m.valor > GLUCEMIA_ALTA).length;
  const bajas = todas.filter((m) => m.valor < GLUCEMIA_BAJA).length;
  if (altas + bajas < GLUCEMIA_MEDICIONES_MINIMAS) return [];
  return [
    {
      tipo: "glucemia_fuera_rango",
      severidad: "atencion",
      clave: `glucemia_fuera_rango:${semanaISO(d.hoy)}`,
      titulo: "Glucemia fuera de rango",
      texto: `En los últimos ${GLUCEMIA_VENTANA_DIAS} días hubo ${altas + bajas} mediciones de glucemia de más de ${GLUCEMIA_ALTA} o menos de ${GLUCEMIA_BAJA} mg/dL. ${FRASE_MEDICO}`,
      datos: { cantidad: altas + bajas, altas, bajas },
      href: "/app/mi-salud/monitoreo",
      vigente_hasta: vigenteHasta(d.hoy),
    },
  ];
}

// --- 5. Estudio con valores fuera del rango impreso ------------------------------------------------------------

export function reglaEstudioFueraDeRango(d: DatosPersonaObs): ObservacionNueva[] {
  const desde = sumarDias(d.hoy, -ESTUDIO_VENTANA_DIAS);
  const salida: ObservacionNueva[] = [];
  for (const e of d.estudios) {
    const cargado = fechaDeInstante(e.created_at);
    if (cargado < desde || cargado > d.hoy) continue;
    // Solo con un rango IMPRESO en el documento: vita nunca usa un rango propio para los estudios.
    const marcados = e.valores.filter(
      (v) =>
        (v.estado === "alto" || v.estado === "bajo") &&
        (v.rango_min != null || v.rango_max != null || Boolean(v.rango_texto && v.rango_texto.trim()))
    );
    if (marcados.length === 0) continue;
    const nombres = marcados.slice(0, 3).map((v) => textoSeguro(v.nombre, 30)).filter(Boolean);
    const cual = textoSeguro(e.tipo, 40) || "cargado";
    salida.push({
      tipo: "estudio_fuera_rango",
      severidad: "atencion",
      clave: `estudio_fuera_rango:${e.id}`,
      titulo: "Un estudio tiene valores marcados",
      texto: `En el estudio ${cual} ${marcados.length === 1 ? "hay 1 valor" : `hay ${marcados.length} valores`} fuera del rango impreso en el documento${nombres.length ? ` (${nombres.join(", ")})` : ""}. ${FRASE_MEDICO}`,
      datos: { estudio_id: e.id, cantidad: marcados.length },
      href: `/app/mi-salud/estudios/${e.id}`,
      vigente_hasta: finDelDia(sumarDias(cargado, ESTUDIO_VENTANA_DIAS)),
    });
  }
  return salida;
}

// --- 6. Turno cerca ----------------------------------------------------------------------------------------------

export function reglaTurnoCerca(d: DatosPersonaObs): ObservacionNueva[] {
  const salida: ObservacionNueva[] = [];
  for (const t of d.turnos) {
    const fecha = t.fecha.slice(0, 10);
    const faltan = diasEntre(d.hoy, fecha);
    if (faltan < 0 || faltan > TURNO_CERCA_DIAS) continue;
    const hora = t.hora.slice(0, 5);
    if (faltan === 0 && hora <= d.hora) continue; // ya pasó
    const llevar = normalizarLlevar(t.llevar)
      .filter((i) => !i.ok)
      .slice(0, 3)
      .map((i) => textoSeguro(i.t, 30))
      .filter(Boolean);
    const especialidad = textoSeguro(t.especialidad);
    const partes = [`Es ${cuando(d.hoy, fecha)} a las ${hora}.`];
    if (llevar.length) partes.push(`Hay que llevar: ${llevar.join(", ")}.`);
    partes.push("Conviene llevar la lista de medicamentos (la encontrás en Mis medicamentos).");
    salida.push({
      tipo: "turno_cerca",
      severidad: "info",
      clave: `turno_cerca:${t.id}`,
      titulo: `Turno de ${especialidad} ${cuando(d.hoy, fecha)}`,
      texto: partes.join(" "),
      datos: { turno_id: t.id, fecha, hora },
      href: "/app/turnos",
      vigente_hasta: finDelDia(fecha),
    });
  }
  return salida;
}

// --- 7. Tratamiento que termina ----------------------------------------------------------------------------------

export function reglaTratamientoTermina(d: DatosPersonaObs): ObservacionNueva[] {
  const grupos = new Map<string, { nombre: string; fecha: string }>();
  for (const m of d.medicamentos) {
    if (!m.fecha_fin) continue;
    const fecha = m.fecha_fin.slice(0, 10);
    const faltan = diasEntre(d.hoy, fecha);
    if (faltan < 0 || faltan > TRATAMIENTO_TERMINA_DIAS) continue;
    const clave = `${slug(m.nombre)}:${fecha}`;
    if (!grupos.has(clave)) grupos.set(clave, { nombre: textoSeguro(m.nombre), fecha });
  }
  return [...grupos].map(([clave, g]) => ({
    tipo: "tratamiento_termina" as const,
    severidad: "info" as const,
    clave: `tratamiento_termina:${clave}`,
    titulo: `Termina el tratamiento con ${g.nombre}`,
    texto: `El tratamiento con ${g.nombre} termina ${cuando(d.hoy, g.fecha)}. Si hay que seguirlo o tenés dudas, ${FRASE_MEDICO.charAt(0).toLowerCase()}${FRASE_MEDICO.slice(1)}`,
    datos: { fecha_fin: g.fecha },
    href: "/app/medicamentos",
    vigente_hasta: finDelDia(g.fecha),
  }));
}

// --- 8. Medición pendiente -----------------------------------------------------------------------------------------

const NOMBRE_METRICA: Record<string, string> = {
  presion: "presión",
  glucemia: "glucemia",
  peso: "peso",
  pulso: "pulso",
  saturacion: "saturación",
  temperatura: "temperatura",
};

export function reglaMedicionPendiente(d: DatosPersonaObs): ObservacionNueva[] {
  const salida: ObservacionNueva[] = [];
  const clave = (tipo: string, otra: string | null) => `${tipo}|${(otra ?? "").trim().toLowerCase()}`;
  for (const p of d.monitoreos) {
    if (p.fecha_fin && p.fecha_fin.slice(0, 10) < d.hoy) continue;
    // Un plan recién creado todavía no tuvo tiempo de acumular días sin medir.
    if (diasEntre(fechaDeInstante(p.created_at), d.hoy) < MEDICION_PENDIENTE_DIAS) continue;
    const fechas = d.mediciones.filter((m) => clave(m.tipo, m.nombre_otra) === clave(p.tipo, p.nombre_otra)).map((m) => fechaDeInstante(m.medido_at));
    const ultima = fechas.sort().at(-1);
    if (ultima && diasEntre(ultima, d.hoy) < MEDICION_PENDIENTE_DIAS) continue;
    const metrica = p.tipo === "otra" ? textoSeguro(p.nombre_otra, 30).toLowerCase() || "una medición" : (NOMBRE_METRICA[p.tipo] ?? p.tipo);
    salida.push({
      tipo: "medicion_pendiente",
      severidad: "info",
      clave: `medicion_pendiente:${p.id}:${semanaISO(d.hoy)}`,
      titulo: `Falta cargar una medición de ${metrica}`,
      texto: `Hace ${MEDICION_PENDIENTE_DIAS} días o más que no se carga ninguna medición de ${metrica}, y hay un monitoreo activo.`,
      datos: { monitoreo_id: p.id, ultima_fecha: ultima ?? null },
      href: "/app/mi-salud/monitoreo",
      vigente_hasta: vigenteHasta(d.hoy),
    });
  }
  return salida;
}

// --- 9. Familia sin tomas (para quien cuida con rol Admin) ----------------------------------------------------------

export function reglaFamiliaSinTomas(d: DatosPersonaObs): ObservacionNueva[] {
  if (d.cuidadoresEditores < 1) return [];
  const marcas = marcasPorMedicamento(d);
  for (let i = 1; i <= FAMILIA_SIN_TOMAS_DIAS; i++) {
    const fecha = sumarDias(d.hoy, -i);
    const programadas = d.medicamentos.filter((m) => programadaEn(m, fecha));
    // Sin dosis programadas ese día no hay nada que no se haya marcado.
    if (programadas.length === 0) return [];
    if (programadas.some((m) => marcas.has(`${m.id}|${fecha}`))) return [];
  }
  const nombre = primerNombre(d.nombre);
  return [
    {
      tipo: "familia_sin_tomas",
      severidad: "atencion",
      clave: `familia_sin_tomas:${semanaISO(d.hoy)}`,
      titulo: `${nombre} no marcó tomas`,
      texto: `${nombre} no marcó ninguna toma en los últimos ${FAMILIA_SIN_TOMAS_DIAS} días. Puede ser un buen momento para preguntarle cómo está.`,
      datos: { persona_id: d.personaId, dias: FAMILIA_SIN_TOMAS_DIAS },
      href: `/app/familia/${d.personaId}`,
      vigente_hasta: vigenteHasta(d.hoy),
    },
  ];
}

/** Todas las reglas sobre los datos de una persona. */
export function evaluarReglas(d: DatosPersonaObs): ObservacionNueva[] {
  return [
    ...reglaStockBajoDias(d),
    ...reglaTomasSalteadas(d),
    ...reglaPresionAlta(d),
    ...reglaGlucemiaFueraDeRango(d),
    ...reglaEstudioFueraDeRango(d),
    ...reglaTurnoCerca(d),
    ...reglaTratamientoTermina(d),
    ...reglaMedicionPendiente(d),
    ...reglaFamiliaSinTomas(d),
  ];
}
