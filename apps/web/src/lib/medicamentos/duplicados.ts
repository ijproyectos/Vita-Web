import { DIAS_SEMANA, type DiaSemana } from "./tipos";

export type HorarioMedicamento = {
  nombre: string;
  horaProgramada: string;
  diasRecurrentes?: DiaSemana[];
};

/** Entrada inválida de un medicamento: el mensaje es apto para mostrar o relatar al usuario. */
export class ErrorEntradaMedicamento extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorEntradaMedicamento";
  }
}

export class ErrorHorarioMedicamentoDuplicado extends Error {
  readonly codigo = "medicamento_horario_duplicado";

  constructor() {
    super("Este medicamento ya está agregado a esa hora en días coincidentes. No lo agregamos de nuevo.");
    this.name = "ErrorHorarioMedicamentoDuplicado";
  }
}

export function normalizarHoraDuplicados(hora: string): string {
  if (typeof hora !== "string") throw new ErrorEntradaMedicamento("Revisá los horarios.");
  const limpia = hora.trim();
  if (!/^(?:\d{1,2}:\d{2}|\d{2}:\d{2}:00)$/.test(limpia)) {
    throw new ErrorEntradaMedicamento("Revisá los horarios.");
  }
  const [h, m] = limpia.split(":").map(Number);
  if (h > 23 || m > 59) throw new ErrorEntradaMedicamento("Revisá los horarios.");
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function normalizarNombreMedicamento(nombre: string): string {
  if (typeof nombre !== "string" || !nombre.trim()) throw new ErrorEntradaMedicamento("El nombre no puede quedar vacío.");
  return nombre.trim().replace(/\s+/g, " ").toLowerCase();
}

export function normalizarHorarioMedicamento(horario: HorarioMedicamento): Required<HorarioMedicamento> {
  const nombre = normalizarNombreMedicamento(horario.nombre);
  const dias = horario.diasRecurrentes === undefined ? [] : horario.diasRecurrentes;
  if (!Array.isArray(dias) || [...dias].some((d) => !DIAS_SEMANA.includes(d))) {
    throw new ErrorEntradaMedicamento("Revisá los días del medicamento.");
  }
  return {
    nombre,
    horaProgramada: normalizarHoraDuplicados(horario.horaProgramada),
    diasRecurrentes: [...dias],
  };
}

export function horariosCoinciden(a: HorarioMedicamento, b: HorarioMedicamento): boolean {
  const x = normalizarHorarioMedicamento(a);
  const y = normalizarHorarioMedicamento(b);
  return x.nombre === y.nombre && x.horaProgramada === y.horaProgramada && (
    x.diasRecurrentes.length === 0 || y.diasRecurrentes.length === 0 ||
    x.diasRecurrentes.some((d) => y.diasRecurrentes.includes(d))
  );
}

/** Solo esta exclusión representa el conflicto de dominio; otros errores conservan su causa. */
export function traducirErrorDuplicado(error: { code?: string; message: string }): void {
  if (error.code === "23P01" && error.message.includes('"medicamentos_sin_horarios_duplicados"')) {
    throw new ErrorHorarioMedicamentoDuplicado();
  }
}
