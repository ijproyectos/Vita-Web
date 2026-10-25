import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ConComida,
  MomentoDia,
  DatosActualizarGrupo,
  DatosActualizarHorario,
  DatosNuevoMedicamento,
  DatosNuevoMedicamentoMultiMomento,
  DiaSemana,
  Medicamento,
  MedicamentoConToma,
  ResumenAdherencia,
  TomaRegistrada,
} from "./tipos";
import { HORA_POR_MOMENTO } from "./tipos";
import { ajustarStock, buscarInventarioId } from "@/lib/inventario/nucleo";
import { claveMedicamento } from "@/lib/inventario/tipos";
import { momentoDelDia } from "@/lib/rutina/momento";

// Núcleo de lógica de medicamentos, sin acoplarse a Server Actions ni al
// chat con IA — ambos llaman a estas mismas funciones (pasando el cliente
// Supabase con la sesión del usuario ya resuelta), así que el
// comportamiento nunca se duplica ni se puede desincronizar entre la UI y
// el asistente. `SupabaseClient` es genérico a propósito para no tipar
// contra un `Database` autogenerado que este proyecto todavía no tiene.
type Cliente = SupabaseClient;

const DIAS_POR_INDICE: DiaSemana[] = [
  "domingo",
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado",
];

/**
 * Día de la semana (en español, minúsculas) de una fecha dada, en el
 * calendario de Argentina — exportada porque el detector de dosis
 * vencidas necesita el día correspondiente a un `ahora` explícito, igual
 * criterio que `fechaEnAR`.
 *
 * OJO: NO se puede usar `fecha.getDay()` directo — depende del huso
 * horario del proceso (Netlify/Node corren en UTC), así que entre las
 * 21:00 y 23:59 hora AR (00:00-02:59 UTC del día siguiente) devolvería el
 * día de mañana, no el de hoy en Argentina — exactamente la misma clase
 * de desfase UTC/AR que `horaEnAR` documenta para la hora, pero en el día
 * de la semana. Se reconstruye
 * la fecha a partir de sus componentes Y/M/D ya en huso AR (vía
 * `Intl.DateTimeFormat`) antes de pedir `getDay()`, para que el resultado
 * no dependa del huso del proceso.
 */
export function diaSemanaDe(fecha: Date): DiaSemana {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(fecha);
  const obj = Object.fromEntries(partes.map((p) => [p.type, p.value]));
  const fechaAR = new Date(Number(obj.year), Number(obj.month) - 1, Number(obj.day));
  return DIAS_POR_INDICE[fechaAR.getDay()];
}

function diaDeHoy(): DiaSemana {
  return diaSemanaDe(new Date());
}

/**
 * Fecha "YYYY-MM-DD" de pared en Argentina: "el día de la dosis" para el
 * usuario. Es la que usa `medicamentos_tomas.fecha` (migración 032; antes era
 * UTC) y también los recordatorios y el dedupe de alertas push, que no deben
 * duplicarse ni perderse al cruzar la medianoche UTC (21:00 AR).
 */
export function fechaEnAR(fecha: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(fecha);
}

function fechaDeHoy(): string {
  return fechaEnAR();
}

/**
 * Hora de pared argentina ("HH:MM") de un instante dado. `hora_programada`
 * siempre representa una hora AR, sin importar en qué huso horario corre
 * el proceso (Netlify/Node corren en UTC) — `new Date()` captura el
 * instante real, y esto lo reconstruye a la hora de pared que un usuario
 * en Argentina vería en ese momento. Usada por `esDosisVencida` (detector
 * de dosis vencidas) y por el badge "atrasada" de modo simple.
 */
export function horaEnAR(fecha: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(fecha);
}

/**
 * Predicado puro: ¿una dosis programada a `horaProgramada` ("HH:MM", hora
 * AR) está vencida a `ahoraHHMM` ("HH:MM", ya convertida a hora AR — ver
 * `horaEnAR`), dado un margen de gracia en minutos? No conoce fechas ni
 * confirmaciones — quien llama resuelve eso (ver `detectarDosisVencidas`,
 * lib/notificaciones/nucleo.ts).
 */
export function esDosisVencida(
  horaProgramada: string,
  ahoraHHMM: string,
  minutosGracia: number
): boolean {
  const aMinutos = (hhmm: string): number => {
    const [horas, minutos] = hhmm.split(":").map(Number);
    return horas * 60 + minutos;
  };

  return aMinutos(ahoraHHMM) - aMinutos(horaProgramada) >= minutosGracia;
}

/**
 * Fin de la ventana de medianoche (hora AR): hasta las 00:30 las dosis de
 * AYER que nadie tomó siguen contando como vencidas (decisión del usuario).
 * Pasada esa hora dejan de contar — y de alertar.
 */
export const FIN_VENTANA_MEDIANOCHE = "00:30";

/**
 * Predicado puro: ¿una dosis de AYER ("HH:MM", hora AR) sigue vencida a
 * `ahoraHHMM` (hora AR de hoy)? Solo dentro de la ventana 00:00-00:29 AR y
 * con el mismo margen de gracia, contado cruzando la medianoche (23:50 a las
 * 00:10 son 20 minutos). Fuera de la ventana siempre `false`, así que una
 * dosis futura de HOY nunca se confunde con una vencida (un "+24 h"
 * genérico en `esDosisVencida` lo haría). Igual que `esDosisVencida`, quien
 * llama resuelve días aplicables y confirmaciones (ver
 * `filtrarDosisDeAyerVencidas`).
 */
export function esDosisDeAyerVencida(
  horaProgramada: string,
  ahoraHHMM: string,
  minutosGracia: number
): boolean {
  if (ahoraHHMM >= FIN_VENTANA_MEDIANOCHE) return false;
  const aMinutos = (hhmm: string): number => {
    const [horas, minutos] = hhmm.split(":").map(Number);
    return horas * 60 + minutos;
  };
  return aMinutos(ahoraHHMM) + 24 * 60 - aMinutos(horaProgramada) >= minutosGracia;
}

/** Fecha AR "YYYY-MM-DD" del día anterior al de `fecha` (AR no tiene horario de verano: 24 h exactas). */
export function fechaAyerEnAR(fecha: Date = new Date()): string {
  return fechaEnAR(new Date(fecha.getTime() - 24 * 60 * 60 * 1000));
}

/** ¿El medicamento aplica el día de la semana (AR) de `dia`? Sin días = todos. */
export function aplicaEnDia(medicamento: Pick<Medicamento, "dias_recurrentes">, dia: DiaSemana): boolean {
  return medicamento.dias_recurrentes.length === 0 || medicamento.dias_recurrentes.includes(dia);
}

/**
 * Dosis de AYER aún vencidas en la ventana de medianoche: las que aplicaban
 * el día de la semana de ayer (AR), no figuran en `tomadas` (ids de
 * medicamento con `tomado=true`) y superan la gracia cruzando las 00:00.
 * Pura; `[]` fuera de la ventana. Quien arma `tomadas` debe mirar
 * `medicamentos_tomas.fecha = ayerAR` (o hoy AR si ya se marcó pasada la
 * medianoche sin indicar la fecha de la dosis): `marcarTomado` graba la fecha
 * AR de la dosis.
 */
export function filtrarDosisDeAyerVencidas<T extends Pick<Medicamento, "hora_programada" | "dias_recurrentes"> & { id: string }>(
  meds: T[],
  tomadas: Set<string>,
  ahora: Date,
  minutosGracia: number
): T[] {
  const horaAhora = horaEnAR(ahora);
  if (horaAhora >= FIN_VENTANA_MEDIANOCHE) return [];
  const diaAyer = diaSemanaDe(new Date(ahora.getTime() - 24 * 60 * 60 * 1000));
  return meds.filter(
    (m) =>
      aplicaEnDia(m, diaAyer) &&
      !tomadas.has(m.id) &&
      esDosisDeAyerVencida(m.hora_programada, horaAhora, minutosGracia)
  );
}

/**
 * Dosis de ayer sin tomar y aún vencidas de UNA persona (ver
 * `filtrarDosisDeAyerVencidas`). Fuera de la ventana no consulta nada.
 * Nunca lanza: ante un error de lectura devuelve [] (se degrada al
 * comportamiento previo, sin dosis de ayer).
 */
export async function listarVencidasDeAyer(
  supabase: Cliente,
  usuarioId: string,
  ahora: Date = new Date(),
  minutosGracia = 0
): Promise<Medicamento[]> {
  if (horaEnAR(ahora) >= FIN_VENTANA_MEDIANOCHE) return [];
  try {
    const todos = await listarTodos(supabase, usuarioId);
    if (todos.length === 0) return [];
    const { data, error } = await supabase
      .from("medicamentos_tomas")
      .select("medicamento_id")
      .eq("usuario_id", usuarioId)
      .eq("tomado", true)
      // Solo la fecha de ayer: mismo criterio que el detector del cron. Una
      // toma con fecha de hoy es la dosis de hoy, no cubre la de ayer.
      .eq("fecha", fechaAyerEnAR(ahora));
    if (error) return [];
    const tomadas = new Set((data ?? []).map((t) => t.medicamento_id as string));
    return filtrarDosisDeAyerVencidas(todos, tomadas, ahora, minutosGracia);
  } catch {
    return [];
  }
}

export function aplicaHoy(medicamento: Medicamento): boolean {
  return (
    medicamento.dias_recurrentes.length === 0 ||
    medicamento.dias_recurrentes.includes(diaDeHoy())
  );
}

export async function listarTodos(
  supabase: Cliente,
  usuarioId: string
): Promise<Medicamento[]> {
  const { data, error } = await supabase
    .from("medicamentos")
    .select("*")
    .eq("usuario_id", usuarioId)
    .order("hora_programada", { ascending: true });

  if (error) throw new Error(`No se pudieron leer los medicamentos: ${error.message}`);
  return data as Medicamento[];
}

/** Cantidad de remedios distintos (por nombre) de una persona. */
export async function contarRemediosDistintos(supabase: Cliente, usuarioId: string): Promise<number> {
  const todos = await listarTodos(supabase, usuarioId);
  return new Set(todos.map((m) => m.nombre.trim().toLowerCase())).size;
}

export async function listarHoy(
  supabase: Cliente,
  usuarioId: string
): Promise<MedicamentoConToma[]> {
  const todos = await listarTodos(supabase, usuarioId);
  const deHoy = todos.filter(aplicaHoy);
  if (deHoy.length === 0) return [];

  const { data: tomas, error } = await supabase
    .from("medicamentos_tomas")
    .select("id, medicamento_id, tomado")
    .eq("usuario_id", usuarioId)
    .eq("fecha", fechaDeHoy())
    .in(
      "medicamento_id",
      deHoy.map((m) => m.id)
    );

  if (error) throw new Error(`No se pudieron leer las tomas de hoy: ${error.message}`);

  const tomaPorMedicamento = new Map(
    (tomas ?? []).map((t) => [t.medicamento_id as string, t])
  );

  return deHoy.map((m) => {
    const toma = tomaPorMedicamento.get(m.id);
    return { ...m, tomado: toma?.tomado ?? false, toma_id: toma?.id ?? null };
  });
}

/**
 * Tomas registradas desde `desdeFecha` ("YYYY-MM-DD", AR) hasta hoy: alimenta
 * la semana del detalle del medicamento y el Historial de la Rutina. Nunca
 * lanza: una lectura fallida devuelve [] (la UI muestra "sin tomas").
 */
export async function listarTomasDesde(
  supabase: Cliente,
  usuarioId: string,
  desdeFecha: string
): Promise<TomaRegistrada[]> {
  const { data, error } = await supabase
    .from("medicamentos_tomas")
    .select("medicamento_id, fecha, tomado, tomado_en")
    .eq("usuario_id", usuarioId)
    .gte("fecha", desdeFecha)
    .order("fecha", { ascending: true });
  if (error) return [];
  return data as TomaRegistrada[];
}

/**
 * Resuelve un nombre libre (el que escribe el usuario en el chat, ej. "el
 * ibuprofeno") al medicamento real, con match case-insensitive por
 * substring — igual necesidad que el `mark_taken` del agente original
 * ("resolves name → ID"), solo que acá no hay un ID que el modelo pueda
 * conocer de antemano.
 *
 * `horaHint` (opcional, "HH:MM") desambigua cuando el mismo nombre tiene
 * varias filas — el form de "Agregar medicamento" puede crear varias de
 * una sola vez (una por momento elegido, mismo nombre) desde
 * `agregarMultiMomento`, y sin esto la de "la noche" quedaba inalcanzable
 * por chat: siempre resolvía a la primera coincidencia (típicamente la de
 * la mañana). Si no hay hint o no matchea ninguna, cae al primer match de
 * siempre.
 */
export async function buscarPorNombre(
  supabase: Cliente,
  usuarioId: string,
  nombre: string,
  horaHint?: string
): Promise<Medicamento | null> {
  const todos = await listarTodos(supabase, usuarioId);
  const buscado = nombre.trim().toLowerCase();

  // Exactas primero (mismo criterio que antes: una coincidencia exacta le
  // gana a cualquier cantidad de coincidencias parciales); recién si no
  // hay ninguna exacta se cae a substring.
  const exactas = todos.filter((m) => m.nombre.toLowerCase() === buscado);
  const coincidencias = exactas.length > 0 ? exactas : todos.filter((m) => m.nombre.toLowerCase().includes(buscado));

  if (coincidencias.length === 0) return null;
  if (coincidencias.length === 1 || !horaHint) return coincidencias[0];

  return coincidencias.find((m) => m.hora_programada === horaHint) ?? coincidencias[0];
}

export async function agregar(
  supabase: Cliente,
  usuarioId: string,
  datos: DatosNuevoMedicamento
): Promise<Medicamento> {
  const { data, error } = await supabase
    .from("medicamentos")
    .insert({
      usuario_id: usuarioId,
      nombre: datos.nombre,
      dosis: datos.dosis ?? null,
      unidad: datos.unidad ?? "mg",
      hora_programada: datos.horaProgramada,
      momento_dia: datos.momentoDia,
      condicion: datos.condicion ?? null,
      dias_recurrentes: datos.diasRecurrentes ?? [],
      frecuencia: datos.frecuencia ?? null,
      con_comida: datos.conComida ?? "no-importa",
      duracion: datos.duracion ?? null,
      notas: datos.notas ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(`No se pudo crear el medicamento: ${error.message}`);
  return data as Medicamento;
}

/**
 * Crea una fila por cada momento elegido en el form nuevo
 * (AgregarMedicamentoScreen del diseño) — mismo dato compartido, hora
 * default por momento (HORA_POR_MOMENTO). No usa una transacción explícita:
 * si una fila falla a mitad de camino, las ya insertadas quedan (mismo
 * riesgo aceptado que el resto de los inserts simples de este proyecto,
 * sin RPC porque no hay dinero ni un invariante cross-fila que proteger).
 */
export async function agregarMultiMomento(
  supabase: Cliente,
  usuarioId: string,
  datos: DatosNuevoMedicamentoMultiMomento
): Promise<Medicamento[]> {
  // Si ese medicamento (nombre+dosis) ya tiene stock cargado, las filas
  // nuevas nacen enganchadas a él (un solo stock compartido por medicamento).
  const inventarioId = await buscarInventarioId(supabase, usuarioId, datos.nombre, datos.dosis);

  // Alta por toma (hora propia + comida por fila) o por momento (hora por defecto).
  const plan: { hora: string; momento: MomentoDia; conComida: ConComida }[] = datos.tomas?.length
    ? datos.tomas.map((t) => ({ hora: t.hora, momento: momentoDelDia(t.hora), conComida: t.conComida }))
    : (datos.momentos ?? []).map((m) => ({ hora: HORA_POR_MOMENTO[m], momento: m, conComida: datos.conComida ?? "no-importa" }));
  if (plan.length === 0) throw new Error("Falta al menos un horario.");

  const filas = plan.map((toma) => ({
    // Solo si hay uno: así el insert tampoco depende de que la columna exista.
    ...(inventarioId ? { inventario_id: inventarioId } : {}),
    usuario_id: usuarioId,
    nombre: datos.nombre,
    dosis: datos.dosis ?? null,
    unidad: datos.unidad ?? "mg",
    hora_programada: toma.hora,
    momento_dia: toma.momento,
    dias_recurrentes: [],
    frecuencia: datos.frecuencia ?? null,
    con_comida: toma.conComida,
    duracion: datos.duracion ?? null,
    notas: datos.notas ?? null,
  }));

  const { data, error } = await supabase.from("medicamentos").insert(filas).select();
  if (error) throw new Error(`No se pudo crear el medicamento: ${error.message}`);
  return data as Medicamento[];
}

/**
 * Dueño (usuario_id) de un medicamento visible para la sesión (propio o de
 * alguien que cuida, por RLS), o null. Lo usan las acciones sobre una fila
 * existente para escribir con el usuario_id correcto aunque el perfil activo
 * sea otro (ej. Modo simple marca siempre lo propio).
 */
export async function duenioDeMedicamento(supabase: Cliente, medicamentoId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("medicamentos")
    .select("usuario_id")
    .eq("id", medicamentoId)
    .maybeSingle();
  if (error) throw new Error(`No se pudo leer el medicamento: ${error.message}`);
  return (data?.usuario_id as string | undefined) ?? null;
}

export async function obtenerPorId(
  supabase: Cliente,
  usuarioId: string,
  medicamentoId: string
): Promise<Medicamento | null> {
  const { data, error } = await supabase
    .from("medicamentos")
    .select("*")
    .eq("id", medicamentoId)
    .eq("usuario_id", usuarioId)
    .maybeSingle();

  if (error) throw new Error(`No se pudo leer el medicamento: ${error.message}`);
  return data as Medicamento | null;
}

export async function actualizarHorario(
  supabase: Cliente,
  usuarioId: string,
  medicamentoId: string,
  datos: DatosActualizarHorario
): Promise<Medicamento> {
  const cambios: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (datos.horaProgramada !== undefined) cambios.hora_programada = datos.horaProgramada;
  if (datos.momentoDia !== undefined) cambios.momento_dia = datos.momentoDia;
  if (datos.diasRecurrentes !== undefined) cambios.dias_recurrentes = datos.diasRecurrentes;

  const { data, error } = await supabase
    .from("medicamentos")
    .update(cambios)
    .eq("id", medicamentoId)
    .eq("usuario_id", usuarioId)
    .select()
    .single();

  if (error) throw new Error(`No se pudo actualizar el horario: ${error.message}`);
  return data as Medicamento;
}

export async function eliminarHorario(
  supabase: Cliente,
  usuarioId: string,
  medicamentoId: string
): Promise<void> {
  const { error } = await supabase
    .from("medicamentos")
    .delete()
    .eq("id", medicamentoId)
    .eq("usuario_id", usuarioId);

  if (error) throw new Error(`No se pudo eliminar el medicamento: ${error.message}`);
}

/**
 * Edita un medicamento completo (todas las filas/horarios del grupo) desde
 * "Mis medicamentos". Las filas existentes se identifican por id (conservan
 * sus tomas), las tomas sin id se crean copiando lo compartido de la primera
 * fila (stock, indicaciones, días) y las filas que ya no vienen se borran.
 * Si el medicamento tiene stock y cambia nombre/dosis, el inventario se
 * renombra para que siga enganchado (best-effort: nunca bloquea el guardado).
 */
export async function actualizarGrupo(
  supabase: Cliente,
  usuarioId: string,
  ids: string[],
  datos: DatosActualizarGrupo
): Promise<void> {
  const nombre = datos.nombre.trim();
  if (!nombre) throw new Error("El nombre no puede quedar vacío.");
  if (datos.tomas.length === 0) throw new Error("Tiene que haber al menos un horario.");
  if (datos.tomas.some((t) => !/^\d{2}:\d{2}$/.test(t.hora))) throw new Error("Revisá los horarios.");
  if (new Set(datos.tomas.map((t) => t.hora)).size !== datos.tomas.length) {
    throw new Error("Hay dos tomas a la misma hora.");
  }

  const { data: existentes, error: errLeer } = await supabase
    .from("medicamentos")
    .select("*")
    .eq("usuario_id", usuarioId)
    .in("id", ids)
    .order("hora_programada", { ascending: true });
  if (errLeer) throw new Error(`No se pudo leer el medicamento: ${errLeer.message}`);
  const filas = (existentes ?? []) as Medicamento[];
  if (filas.length === 0) throw new Error("No encontramos ese medicamento.");

  const idsValidos = new Set(filas.map((f) => f.id));
  if (datos.tomas.some((t) => t.id && !idsValidos.has(t.id))) throw new Error("Ese medicamento cambió. Volvé a abrirlo.");

  const compartido: Record<string, unknown> = { nombre, dosis: datos.dosis, unidad: datos.unidad };
  if (datos.frecuencia !== undefined) compartido.frecuencia = datos.frecuencia;
  const ahora = new Date().toISOString();

  // Primero lo que no puede dejar el grupo a medias: altas y borrados.
  const conservar = new Set(datos.tomas.flatMap((t) => (t.id ? [t.id] : [])));
  const aBorrar = filas.filter((f) => !conservar.has(f.id)).map((f) => f.id);
  const molde = filas[0];

  const nuevas = datos.tomas.filter((t) => !t.id);
  if (nuevas.length > 0) {
    const { id: _id, created_at: _c, updated_at: _u, ...base } = molde;
    void _id;
    void _c;
    void _u;
    const { error } = await supabase.from("medicamentos").insert(
      nuevas.map((t) => ({
        ...base,
        ...compartido,
        hora_programada: t.hora,
        momento_dia: momentoDelDia(t.hora),
        con_comida: t.conComida,
      }))
    );
    if (error) throw new Error(`No se pudo guardar el horario nuevo: ${error.message}`);
  }

  for (const t of datos.tomas.filter((x) => x.id)) {
    const { error } = await supabase
      .from("medicamentos")
      .update({
        ...compartido,
        hora_programada: t.hora,
        momento_dia: momentoDelDia(t.hora),
        con_comida: t.conComida,
        updated_at: ahora,
      })
      .eq("id", t.id!)
      .eq("usuario_id", usuarioId);
    if (error) throw new Error(`No se pudo actualizar el medicamento: ${error.message}`);
  }

  if (aBorrar.length > 0) {
    const { error } = await supabase.from("medicamentos").delete().in("id", aBorrar).eq("usuario_id", usuarioId);
    if (error) throw new Error(`No se pudo quitar el horario: ${error.message}`);
  }

  if (molde.inventario_id && claveMedicamento(molde.nombre, molde.dosis) !== claveMedicamento(nombre, datos.dosis)) {
    await supabase
      .from("inventario_pastillas")
      .update({ nombre, dosis: datos.dosis })
      .eq("id", molde.inventario_id);
  }
}

/**
 * Borra un medicamento con todos sus horarios (y sus tomas, por cascada). Si
 * su stock de pastillas queda sin ningún medicamento enganchado, también se
 * borra (best-effort) para no dejar un inventario huérfano en "Mis pastillas".
 */
export async function eliminarGrupo(supabase: Cliente, usuarioId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { data: filas } = await supabase
    .from("medicamentos")
    .select("inventario_id")
    .eq("usuario_id", usuarioId)
    .in("id", ids);
  const inventarios = [...new Set((filas ?? []).map((f) => f.inventario_id as string | null).filter((x): x is string => !!x))];

  const { error } = await supabase.from("medicamentos").delete().in("id", ids).eq("usuario_id", usuarioId);
  if (error) throw new Error(`No se pudo eliminar el medicamento: ${error.message}`);

  for (const inventarioId of inventarios) {
    const { count } = await supabase
      .from("medicamentos")
      .select("id", { count: "exact", head: true })
      .eq("inventario_id", inventarioId);
    if ((count ?? 0) === 0) await supabase.from("inventario_pastillas").delete().eq("id", inventarioId);
  }
}

/**
 * Fecha AR con la que se graba (o se busca) la toma marcada en `ahora`. Sin
 * `fechaDosis` es el día AR de hoy. `fechaDosis` ("YYYY-MM-DD") permite marcar
 * una dosis de AYER (tarjeta "Era ayer", /cuidar) pero solo dentro de la
 * ventana 00:00-00:29 AR y solo si es exactamente ayer AR: cualquier otro
 * valor (inválido, futuro, más viejo, ayer fuera de ventana) cae a hoy — el
 * cliente nunca decide una fecha arbitraria.
 */
export function fechaDeTomaEnAR(ahora: Date, fechaDosis?: string): string {
  const hoy = fechaEnAR(ahora);
  if (
    fechaDosis &&
    fechaDosis === fechaAyerEnAR(ahora) &&
    horaEnAR(ahora) < FIN_VENTANA_MEDIANOCHE
  ) {
    return fechaDosis;
  }
  return hoy;
}

/**
 * Los últimos `dias` días AR (de hoy hacia atrás) con su fecha "YYYY-MM-DD" y
 * día de la semana: las claves de `calcularAdherencia`, sin depender del huso
 * del proceso.
 */
export function diasDeAdherencia(ahora: Date, dias: number): { fecha: string; dia: DiaSemana }[] {
  return Array.from({ length: dias }, (_, i) => {
    const instante = new Date(ahora.getTime() - i * 24 * 60 * 60 * 1000); // AR sin horario de verano
    return { fecha: fechaEnAR(instante), dia: diaSemanaDe(instante) };
  });
}

/**
 * `fechaDosis`: ver `fechaDeTomaEnAR` (opcional, solo hoy o ayer dentro de la
 * ventana de medianoche; si no, hoy AR).
 */
export async function marcarTomado(
  supabase: Cliente,
  usuarioId: string,
  medicamentoId: string,
  tomado = true,
  fechaDosis?: string
): Promise<void> {
  const ahora = new Date();
  const fecha = fechaDeTomaEnAR(ahora, fechaDosis);
  // Una tarjeta "Era ayer" tocada después de las 00:30 no puede caer en
  // silencio sobre la dosis de HOY: se rechaza y quien llama avisa.
  if (fechaDosis && fecha !== fechaDosis) {
    throw new Error("Esa toma era de ayer y ya no se puede marcar. Recargá la pantalla.");
  }
  const estadoNuevo = {
    tomado,
    tomado_en: tomado ? ahora.toISOString() : null,
  };

  // Transición atómica: el UPDATE condicionado al estado opuesto devuelve la
  // fila SOLO si este request fue quien la cambió — dos clicks seguidos (o
  // dos dispositivos) no pueden ambos "ganar", así que el stock de pastillas
  // se mueve a lo sumo una vez por cambio real de estado.
  const { data: actualizadas, error: errUpdate } = await supabase
    .from("medicamentos_tomas")
    .update(estadoNuevo)
    .eq("medicamento_id", medicamentoId)
    .eq("fecha", fecha)
    .eq("tomado", !tomado)
    .select("id");

  if (errUpdate) throw new Error(`No se pudo registrar la toma: ${errUpdate.message}`);

  let huboCambio = (actualizadas?.length ?? 0) > 0;

  if (!huboCambio) {
    // No había fila en el estado opuesto: o no existe (primer registro del
    // día) o ya estaba en el estado pedido. `ignoreDuplicates` => ON
    // CONFLICT DO NOTHING, y el select solo devuelve la fila si de verdad
    // se insertó.
    const { data: insertadas, error: errInsert } = await supabase
      .from("medicamentos_tomas")
      .upsert(
        { medicamento_id: medicamentoId, usuario_id: usuarioId, fecha, ...estadoNuevo },
        { onConflict: "medicamento_id,fecha", ignoreDuplicates: true }
      )
      .select("id");

    if (errInsert) throw new Error(`No se pudo registrar la toma: ${errInsert.message}`);
    // Desmarcar algo que nunca estuvo marcado inserta una fila en falso,
    // pero no es un cambio de stock: no hubo toma que devolver.
    huboCambio = tomado && (insertadas?.length ?? 0) > 0;
  }

  if (huboCambio) await moverStock(supabase, medicamentoId, tomado ? -1 : 1);
}

/**
 * Descuenta (-1) o devuelve (+1) una toma del inventario del medicamento, si
 * tiene uno — la RPC multiplica por `pastillas_por_toma` del lado de la DB.
 * Nunca lanza (ver `ajustarStock`).
 */
async function moverStock(supabase: Cliente, medicamentoId: string, direccion: 1 | -1): Promise<void> {
  const { data } = await supabase
    .from("medicamentos")
    .select("inventario_id")
    .eq("id", medicamentoId)
    .maybeSingle();

  const inventarioId = data?.inventario_id as string | null | undefined;
  if (!inventarioId) return;

  await ajustarStock(supabase, inventarioId, direccion);
}

export async function marcarTodosTomados(
  supabase: Cliente,
  usuarioId: string
): Promise<number> {
  const deHoy = await listarHoy(supabase, usuarioId);
  const pendientes = deHoy.filter((m) => !m.tomado);

  await Promise.all(
    pendientes.map((m) => marcarTomado(supabase, usuarioId, m.id, true))
  );

  return pendientes.length;
}

/**
 * Adherencia de los últimos `dias` días. Simple y aproximada a propósito
 * (no reemplaza al `AdherenceStatsResponse` del backend Go original, que
 * quedó sin implementar) — cuenta tomas registradas vs. días esperados
 * por medicamento en la ventana, y una racha de días consecutivos (desde
 * hoy hacia atrás) en que TODOS los medicamentos del día se marcaron
 * tomados.
 */
export async function calcularAdherencia(
  supabase: Cliente,
  usuarioId: string,
  dias = 7
): Promise<ResumenAdherencia> {
  const medicamentos = await listarTodos(supabase, usuarioId);
  if (medicamentos.length === 0) {
    return { porcentaje: 0, rachaDias: 0, medicamentos: [] };
  }

  const ahora = new Date();
  const diasVentana = diasDeAdherencia(ahora, dias);
  const desdeStr = diasVentana[diasVentana.length - 1].fecha;

  const { data: tomas, error } = await supabase
    .from("medicamentos_tomas")
    .select("medicamento_id, fecha, tomado")
    .eq("usuario_id", usuarioId)
    .gte("fecha", desdeStr);

  if (error) throw new Error(`No se pudo calcular la adherencia: ${error.message}`);

  const tomasPorFecha = new Map<string, Set<string>>(); // fecha -> set medicamento_id tomados
  for (const t of tomas ?? []) {
    if (!t.tomado) continue;
    const fecha = t.fecha as string;
    if (!tomasPorFecha.has(fecha)) tomasPorFecha.set(fecha, new Set());
    tomasPorFecha.get(fecha)!.add(t.medicamento_id as string);
  }

  const porMedicamento = new Map(
    medicamentos.map((m) => [
      m.id,
      { medicamentoId: m.id, nombre: m.nombre, tomados: 0, esperados: 0 },
    ])
  );

  let totalTomados = 0;
  let totalEsperados = 0;
  let rachaDias = 0;
  let rachaRota = false;

  for (const { fecha: fechaStr, dia: diaSemana } of diasVentana) {
    const tomadosHoy = tomasPorFecha.get(fechaStr) ?? new Set<string>();

    const esperadosHoy = medicamentos.filter(
      (m) => m.dias_recurrentes.length === 0 || m.dias_recurrentes.includes(diaSemana)
    );

    for (const m of esperadosHoy) {
      const stat = porMedicamento.get(m.id)!;
      stat.esperados += 1;
      totalEsperados += 1;
      if (tomadosHoy.has(m.id)) {
        stat.tomados += 1;
        totalTomados += 1;
      }
    }

    if (!rachaRota) {
      const completo =
        esperadosHoy.length === 0 || esperadosHoy.every((m) => tomadosHoy.has(m.id));
      if (completo) rachaDias += 1;
      else rachaRota = true;
    }
  }

  return {
    porcentaje: totalEsperados === 0 ? 0 : Math.round((totalTomados / totalEsperados) * 100),
    rachaDias,
    medicamentos: [...porMedicamento.values()].map((s) => ({
      ...s,
      porcentaje: s.esperados === 0 ? 0 : Math.round((s.tomados / s.esperados) * 100),
    })),
  };
}
