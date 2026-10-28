// Cálculos PUROS del Historial de la Rutina (calendario de 5 semanas + lista
// del día). Sin I/O ni `server-only`: la vista de cliente los usa con las
// tomas y mediciones reales que le pasa el servidor. Nada se inventa — un día
// sin medicamentos esperados no tiene punto.
//
// Las tomas se indexan por `medicamentos_tomas.fecha`, que se graba en hora
// AR (ver `fechaEnAR` en lib/medicamentos/nucleo.ts); por eso "hoy" del
// calendario es el día AR, igual que en `listarHoy`.

import { textoDosis, type DiaSemana, type Medicamento, type TomaRegistrada } from "@/lib/medicamentos/tipos";

export const DIAS_CALENDARIO = 35;

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MESES_LARGOS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const DIAS_LARGOS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
// getUTCDay(): 0 = domingo.
const DIA_POR_INDICE: DiaSemana[] = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];

export type EstadoDia = "ok" | "miss" | "hoy" | "futuro" | "vacio";

export type CeldaDia = {
  fecha: string;
  n: number;
  /** "abr" en el día 1 y en la primera celda. */
  mes: string;
  estado: EstadoDia;
  /** Hubo al menos una medición ese día (AR). */
  conMedicion: boolean;
};

export type DosisDia = {
  medicamentoId: string;
  nombre: string;
  dosis: string | null;
  hora: string;
  estado: "ok" | "miss" | "pendiente";
  /** "HH:MM" real de la toma (hora AR) si se registró. */
  tomadoA: string | null;
};

function aUTC(fechaISO: string): Date {
  return new Date(`${fechaISO}T00:00:00Z`);
}

export function sumarDias(fechaISO: string, dias: number): string {
  const d = aUTC(fechaISO);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function diaDeSemana(fechaISO: string): DiaSemana {
  return DIA_POR_INDICE[aUTC(fechaISO).getUTCDay()];
}

/** Primer día (lunes) de la grilla de 5 semanas que termina en la semana de `hoy`. */
export function inicioCalendario(hoy: string): string {
  const dow = (aUTC(hoy).getUTCDay() + 6) % 7; // 0 = lunes
  return sumarDias(hoy, -(dow + 28));
}

/** Medicamentos que corresponden ese día (creados hasta ese día + días de la semana). */
export function esperadosEn(meds: Medicamento[], fecha: string): Medicamento[] {
  const dia = diaDeSemana(fecha);
  return meds.filter(
    (m) =>
      (m.fecha_inicio ?? m.created_at).slice(0, 10) <= fecha &&
      (m.dias_recurrentes.length === 0 || m.dias_recurrentes.includes(dia))
  );
}

function horaAR(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

export function dosisDelDia(meds: Medicamento[], tomas: TomaRegistrada[], fecha: string, hoy: string): DosisDia[] {
  return esperadosEn(meds, fecha)
    .map((m): DosisDia => {
      const toma = tomas.find((t) => t.medicamento_id === m.id && t.fecha === fecha && t.tomado);
      const estado = toma ? "ok" : fecha < hoy ? "miss" : "pendiente";
      return {
        medicamentoId: m.id,
        nombre: m.nombre,
        dosis: textoDosis(m) || null,
        hora: m.hora_programada.slice(0, 5),
        estado,
        tomadoA: toma?.tomado_en ? horaAR(toma.tomado_en) || null : null,
      };
    })
    .sort((a, b) => a.hora.localeCompare(b.hora));
}

export function construirCalendario(
  meds: Medicamento[],
  tomas: TomaRegistrada[],
  fechasConMedicion: Set<string>,
  hoy: string
): { celdas: CeldaDia[]; completos: number; contados: number; mesEtiqueta: string } {
  const inicio = inicioCalendario(hoy);
  const celdas: CeldaDia[] = [];
  const mesHoy = hoy.slice(0, 7);
  let completos = 0;
  let contados = 0;

  for (let i = 0; i < DIAS_CALENDARIO; i++) {
    const fecha = sumarDias(inicio, i);
    const d = aUTC(fecha);
    let estado: EstadoDia;
    if (fecha > hoy) estado = "futuro";
    else if (fecha === hoy) estado = esperadosEn(meds, fecha).length ? "hoy" : "vacio";
    else {
      const dosis = dosisDelDia(meds, tomas, fecha, hoy);
      if (dosis.length === 0) estado = "vacio";
      else {
        estado = dosis.every((x) => x.estado === "ok") ? "ok" : "miss";
        if (fecha.startsWith(mesHoy)) {
          contados++;
          if (estado === "ok") completos++;
        }
      }
    }
    celdas.push({
      fecha,
      n: d.getUTCDate(),
      mes: d.getUTCDate() === 1 || i === 0 ? MESES[d.getUTCMonth()] : "",
      estado,
      conMedicion: fechasConMedicion.has(fecha),
    });
  }

  return { celdas, completos, contados, mesEtiqueta: MESES_LARGOS[aUTC(hoy).getUTCMonth()] };
}

/** "Vie 2 may · hoy" */
export function etiquetaDiaHistorial(fecha: string, hoy: string): string {
  const d = aUTC(fecha);
  return `${DIAS_LARGOS[d.getUTCDay()]} ${d.getUTCDate()} ${MESES[d.getUTCMonth()]}${fecha === hoy ? " · hoy" : ""}`;
}

/** Últimos 7 días (más viejo primero) de UN medicamento: true/false/null (sin esperar). */
export function semanaDeMedicamento(
  med: Medicamento,
  tomas: TomaRegistrada[],
  hoy: string
): { fecha: string; inicial: string; estado: "ok" | "miss" | "pendiente" | "no-aplica" }[] {
  const INICIAL = ["D", "L", "M", "M", "J", "V", "S"];
  return Array.from({ length: 7 }, (_, i) => {
    const fecha = sumarDias(hoy, i - 6);
    const aplica = esperadosEn([med], fecha).length > 0;
    const tomado = tomas.some((t) => t.medicamento_id === med.id && t.fecha === fecha && t.tomado);
    const estado = !aplica && !tomado ? "no-aplica" : tomado ? "ok" : fecha < hoy ? "miss" : "pendiente";
    return { fecha, inicial: INICIAL[aUTC(fecha).getUTCDay()], estado };
  });
}
