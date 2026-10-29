import { normalizarHora } from "@/lib/rutina/momento";
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

/** Throwing flavour of the shared hour normalizer (`normalizarHora`): same semantics, domain error on failure. */
export function normalizarHoraDuplicados(hora: string): string {
  const normal = typeof hora === "string" ? normalizarHora(hora) : null;
  if (!normal) throw new ErrorEntradaMedicamento("Revisá los horarios.");
  return normal;
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

/**
 * Texto apto para mostrar al usuario ante un error del núcleo de medicamentos: los errores de
 * dominio llevan su mensaje; cualquier otro (p. ej. una falla de DB con `error.message` crudo)
 * se reemplaza por `alternativo`, nunca se filtra.
 */
export function mensajeSeguroMedicamento(error: unknown, alternativo: string): string {
  if (error instanceof ErrorEntradaMedicamento || error instanceof ErrorHorarioMedicamentoDuplicado) return error.message;
  return alternativo;
}
