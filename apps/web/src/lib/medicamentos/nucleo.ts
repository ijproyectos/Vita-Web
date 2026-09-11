import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DatosActualizarHorario,
  DatosNuevoMedicamento,
  DatosNuevoMedicamentoMultiMomento,
  DiaSemana,
  Medicamento,
  MedicamentoConToma,
  ResumenAdherencia,
} from "./tipos";
import { HORA_POR_MOMENTO } from "./tipos";

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

function diaDeHoy(): DiaSemana {
  return DIAS_POR_INDICE[new Date().getDay()];
}

function fechaDeHoy(): string {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function aplicaHoy(medicamento: Medicamento): boolean {
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
  const filas = datos.momentos.map((momento) => ({
    usuario_id: usuarioId,
    nombre: datos.nombre,
    dosis: datos.dosis ?? null,
    unidad: datos.unidad ?? "mg",
    hora_programada: HORA_POR_MOMENTO[momento],
    momento_dia: momento,
    dias_recurrentes: [],
    frecuencia: datos.frecuencia ?? null,
    con_comida: datos.conComida ?? "no-importa",
    duracion: datos.duracion ?? null,
    notas: datos.notas ?? null,
  }));

  const { data, error } = await supabase.from("medicamentos").insert(filas).select();
  if (error) throw new Error(`No se pudo crear el medicamento: ${error.message}`);
  return data as Medicamento[];
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

export async function marcarTomado(
  supabase: Cliente,
  usuarioId: string,
  medicamentoId: string,
  tomado = true
): Promise<void> {
  const { error } = await supabase.from("medicamentos_tomas").upsert(
    {
      medicamento_id: medicamentoId,
      usuario_id: usuarioId,
      fecha: fechaDeHoy(),
      tomado,
      tomado_en: tomado ? new Date().toISOString() : null,
    },
    { onConflict: "medicamento_id,fecha" }
  );

  if (error) throw new Error(`No se pudo registrar la toma: ${error.message}`);
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

  const desde = new Date();
  desde.setDate(desde.getDate() - (dias - 1));
  const desdeStr = desde.toISOString().slice(0, 10);

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

  const dow: DiaSemana[] = DIAS_POR_INDICE;
  let totalTomados = 0;
  let totalEsperados = 0;
  let rachaDias = 0;
  let rachaRota = false;

  for (let i = 0; i < dias; i++) {
    const fecha = new Date();
    fecha.setDate(fecha.getDate() - i);
    const fechaStr = fecha.toISOString().slice(0, 10);
    const diaSemana = dow[fecha.getDay()];
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
