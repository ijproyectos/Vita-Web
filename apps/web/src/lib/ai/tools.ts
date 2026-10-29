import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import * as medicamentos from "@/lib/medicamentos/nucleo";
import { ErrorMedicamentoAmbiguo } from "@/lib/medicamentos/resolucion";
import { ErrorEntradaMedicamento, ErrorHorarioMedicamentoDuplicado, normalizarHoraDuplicados } from "@/lib/medicamentos/duplicados";
import { indicacionDeComida, type DatosNuevoMedicamento, type Medicamento, type MedicamentoConToma } from "@/lib/medicamentos/tipos";
import * as turnos from "@/lib/turnos/nucleo";
import * as perfilNucleo from "@/lib/perfil/nucleo";
import type { CambiosPerfil } from "@/lib/perfil/tipos";
import type { MiembroFamilia } from "@/lib/familia/tipos";
import { momentoDelDia } from "@/lib/rutina/momento";
import { fechaDeHoyISO } from "@/lib/rutina/formato";
import {
  diasAIngles,
  diasDesdeIngles,
  momentoDiaAIngles,
} from "./mapeo";
import { pantallaPorClave } from "./guia-app";
import { limpiarDato } from "./limpiar";
import { ERROR_INDICACION, leerIndicacionDelModelo } from "@/lib/chat/confirmaciones-logica";
import { validarMedicion } from "@/lib/mediciones/tipos";
import { pedirAyudaAFamilia } from "@/lib/notificaciones/pedido-ayuda";
import { accionPedidoAyuda, textoPedidoAyudaParaModelo } from "@/lib/notificaciones/pedido-ayuda-logica";
import { mensajeFaltaConfirmacion, opcionesConfirmarPara, resolverDestino } from "./destino";

export { TOOLS } from "./tools-definiciones";

export type AccionUI = { type: string; [clave: string]: unknown };

export type ResultadoTool = {
  contenido: string; // lo que vuelve al modelo como tool_result
  accionUI?: AccionUI; // si corresponde, se emite como evento SSE {action}
  /** Texto listo para el usuario (confirmaciones resueltas sin pasar por el modelo). */
  textoUsuario?: string;
  /** Código corto si la acción NO se ejecutó (registros_chat.error_codigo). */
  codigo?: string;
};

export type ContextoTool = {
  supabase: SupabaseClient;
  /** El usuario logueado (quien chatea). */
  usuarioId: string;
  /** Personas que cuida (listar_familia): único universo válido para `persona_id`. */
  familia: MiembroFamilia[];
  /** Perfil de un familiar abierto en pantalla (ya validado contra `familia`), si lo hay. */
  abiertoId?: string;
};

/** Frontera común del input del modelo para el precheck y la escritura. */
export function normalizarAltaMedicamento(input: Record<string, unknown>): DatosNuevoMedicamento {
  if (typeof input.name !== "string" || !input.name.trim()) {
    throw new ErrorEntradaMedicamento("Falta un nombre de medicamento válido.");
  }
  let horaProgramada: string;
  try {
    if (typeof input.scheduled_time !== "string") throw new Error();
    horaProgramada = normalizarHoraDuplicados(input.scheduled_time.trim());
  } catch {
    throw new ErrorEntradaMedicamento("Indicá una hora válida en formato HH:MM.");
  }
  const dias = input.recurring_days;
  if (dias !== undefined && (!Array.isArray(dias) || !dias.every((d) => typeof d === "string"))) {
    throw new ErrorEntradaMedicamento("Los días del medicamento deben ser una lista válida.");
  }
  let diasRecurrentes;
  try {
    diasRecurrentes = diasDesdeIngles((dias ?? []) as string[]);
  } catch {
    throw new ErrorEntradaMedicamento("Los días del medicamento deben ser días de la semana válidos.");
  }
  for (const campo of ["dose", "condition"]) {
    if (input[campo] !== undefined && input[campo] !== null && typeof input[campo] !== "string") {
      throw new ErrorEntradaMedicamento("La dosis y la condición deben ser texto.");
    }
  }
  return {
    nombre: input.name.trim(),
    dosis: (input.dose as string | null | undefined) ?? null,
    condicion: (input.condition as string | null | undefined) ?? null,
    horaProgramada,
    momentoDia: momentoDelDia(horaProgramada),
    diasRecurrentes,
  };
}

/** Sin tarjeta ni invitación a confirmar cuando el alta no puede realizarse. */
export function resultadoErrorMedicamento(error: unknown, persona: string | null): ResultadoTool {
  const para = persona ? ` para ${limpiarDato(persona)}` : "";
  if (error instanceof ErrorHorarioMedicamentoDuplicado) {
    return { contenido: `No se guardó ningún cambio${para}: ${limpiarDato(error.message, 240)} No ofrezcas agregarlo igual ni pidas confirmación para duplicarlo.` };
  }
  if (error instanceof ErrorEntradaMedicamento) {
    return { contenido: `No se guardó ningún cambio${para}: ${error.message}` };
  }
  console.warn("medicamento_operacion_fallida", { codigo: "error_inesperado" });
  return { contenido: `No pude verificar o guardar el medicamento${para} por un error temporal. No afirmes que quedó guardado ni pidas confirmación de alta; intentá de nuevo más tarde.` };
}

export async function ejecutarTool(
  nombre: string,
  input: Record<string, unknown>,
  ctx: ContextoTool
): Promise<ResultadoTool> {
  const destino = resolverDestino(nombre, input, ctx);
  if (!destino.ok) return { contenido: destino.contenido, accionUI: destino.accionUI };
  // Defensa en profundidad: quien llama (pedidos.ts) ya exigió la confirmación
  // del servidor y recién ahí pasa `confirmado: true`.
  if (destino.requiereConfirmacion && input.confirmado !== true) {
    return {
      contenido: mensajeFaltaConfirmacion(destino.persona ?? "esa persona"),
      accionUI: opcionesConfirmarPara(destino.persona ?? "esa persona"),
    };
  }

  let resultado: ResultadoTool;
  try {
    resultado = await ejecutarEnDestino(nombre, input, { supabase: ctx.supabase, usuarioId: destino.destinoId });
  } catch (error) {
    if (nombre === "add_medication" || error instanceof ErrorHorarioMedicamentoDuplicado) {
      return resultadoErrorMedicamento(error, destino.persona);
    }
    throw error;
  }
  // Las tarjetas/toasts de una escritura en otra persona dicen para quién.
  if (destino.persona && resultado.accionUI) {
    return { ...resultado, accionUI: { ...resultado.accionUI, persona: destino.persona } };
  }
  return resultado;
}

// `usuarioId` acá ya es el DESTINO validado (el propio usuario o un miembro de
// su familia): los núcleos de dominio filtran por él y la RLS decide el resto.
async function ejecutarEnDestino(
  nombre: string,
  input: Record<string, unknown>,
  ctx: { supabase: SupabaseClient; usuarioId: string }
): Promise<ResultadoTool> {
  const { supabase, usuarioId } = ctx;

  switch (nombre) {
    case "list_today_medications": {
      const hoy = await medicamentos.listarHoy(supabase, usuarioId);
      return { contenido: JSON.stringify(hoy.map(paraModelo)) };
    }

    case "list_all_medications": {
      const todos = await medicamentos.listarTodos(supabase, usuarioId);
      return { contenido: JSON.stringify(todos.map(paraModelo)) };
    }

    case "add_medication": {
      // momentoDia se deriva de scheduled_time, no del time_of_day que
      // manda el modelo — evita que queden inconsistentes entre sí (ej.
      // "20hs" guardado como momento "mediodia" si el modelo se equivoca
      // al llenar el campo separado; la hora es la única fuente de verdad).
      const indicacion = leerIndicacionDelModelo(input.meal_indication);
      if (indicacion === "invalida") return { contenido: ERROR_INDICACION };
      // Solo claves del catálogo: lo que mande el modelo se valida acá, no se guarda tal cual.
      // Se guarda como se pidió, aunque no coincida con la hora habitual de esa comida.
      const creado = await medicamentos.agregar(supabase, usuarioId, {
        ...normalizarAltaMedicamento(input),
        indicacion: indicacion ?? null,
      });
      return {
        contenido: JSON.stringify(paraModelo(creado)),
        accionUI: {
          type: "medication_added",
          id: creado.id,
          name: creado.nombre,
          dose: creado.dosis,
          time: creado.hora_programada,
        },
      };
    }

    // Borrar / cambiar un horario no se ejecuta desde acá: pedidos.ts guarda la pendiente y,
    // tras la confirmación, lo ejecuta por id (lib/chat/pedidos.ts). Defensa en profundidad.
    case "update_schedule":
    case "delete_schedule":
      return { contenido: "Esta acción requiere la confirmación del usuario y no se ejecutó nada." };

    case "mark_taken": {
      let medicamento;
      try {
        medicamento = await medicamentos.buscarPorNombre(
          supabase,
          usuarioId,
          String(input.medication_name),
          input.medication_time_hint as string | undefined
        );
      } catch (e) {
        if (e instanceof ErrorMedicamentoAmbiguo) {
          const opciones = e.candidatos.map((c) => `${c.hora}${c.dosis ? ` (${c.dosis})` : ""}`).join(", ");
          return { contenido: `Hay más de un "${limpiarDato(String(input.medication_name))}": ${opciones}. Preguntale al usuario cuál (o pasá medication_time_hint) y no marques nada todavía.` };
        }
        throw e;
      }
      if (!medicamento) return { contenido: `No encontré un medicamento llamado "${limpiarDato(String(input.medication_name))}".` };

      await medicamentos.marcarTomado(supabase, usuarioId, medicamento.id, true);
      return {
        contenido: `Marcado "${limpiarDato(medicamento.nombre)}" como tomado.`,
        accionUI: { type: "medication_taken", medication_name: medicamento.nombre },
      };
    }

    case "mark_all_taken": {
      const cantidad = await medicamentos.marcarTodosTomados(supabase, usuarioId);
      return {
        contenido: `Marcados ${cantidad} medicamentos como tomados.`,
        accionUI: { type: "all_medications_taken" },
      };
    }

    case "add_appointment": {
      // La validación (formato y fecha pasada) vive en turnos.agregar: si falla
      // se le devuelve el error al modelo para que confirme la fecha.
      let creado;
      try {
        creado = await turnos.agregar(supabase, usuarioId, {
          especialidad: String(input.specialty),
          profesional: (input.professional as string) ?? null,
          lugar: (input.place as string) ?? null,
          fecha: String(input.date),
          hora: String(input.time),
          motivo: (input.reason as string) ?? null,
        });
      } catch (e) {
        return {
          contenido: `ERROR: ${e instanceof Error ? e.message : "no se pudo guardar"} (hoy es ${fechaDeHoyISO()}). No se guardó el turno: confirmá la fecha y la hora con el usuario.`,
        };
      }
      return {
        contenido: JSON.stringify({
          id: creado.id,
          specialty: limpiarDato(creado.especialidad),
          date: creado.fecha,
          time: creado.hora,
        }),
        accionUI: {
          type: "appointment_added",
          id: creado.id,
          specialty: creado.especialidad,
          date: creado.fecha,
          time: creado.hora,
        },
      };
    }

    case "list_today_appointments": {
      const deHoy = await turnos.listarDeHoy(supabase, usuarioId);
      return {
        contenido: JSON.stringify(
          deHoy.map((t) => ({
            id: t.id,
            specialty: limpiarDato(t.especialidad),
            professional: t.profesional ? limpiarDato(t.profesional) : t.profesional,
            place: t.lugar ? limpiarDato(t.lugar) : t.lugar,
            time: t.hora,
          }))
        ),
      };
    }

    case "update_health_profile": {
      const cambios: CambiosPerfil = {};
      if (input.gender) cambios.genero = String(input.gender);
      if (input.blood_type) cambios.grupo_sanguineo = String(input.blood_type);
      if (typeof input.height_cm === "number") cambios.altura_cm = input.height_cm;
      if (typeof input.weight_kg === "number") cambios.peso_kg = input.weight_kg;
      if (input.health_insurance) cambios.obra_social = String(input.health_insurance);

      if (Object.keys(cambios).length === 0) {
        return { contenido: "No se especificó ningún dato para actualizar." };
      }

      await perfilNucleo.actualizarPerfil(supabase, usuarioId, cambios);
      return { contenido: "Perfil actualizado.", accionUI: { type: "profile_updated" } };
    }

    case "add_condition": {
      const label = String(input.label);
      await perfilNucleo.agregarCondicion(supabase, usuarioId, {
        label,
        tipo: input.type === "temporary" ? "temporal" : "permanente",
        desde: (input.since as string) ?? String(new Date().getFullYear()),
      });
      return { contenido: `Condición "${limpiarDato(label)}" agregada.`, accionUI: { type: "condition_added", label } };
    }

    case "add_allergy": {
      const nombre = String(input.name);
      await perfilNucleo.agregarAlergia(supabase, usuarioId, nombre);
      return { contenido: `Alergia "${limpiarDato(nombre)}" agregada.`, accionUI: { type: "allergy_added", name: nombre } };
    }

    case "show_today_medications":
      return { contenido: "Mostrado.", accionUI: { type: "show_today_medications" } };

    case "show_all_medications":
      return { contenido: "Mostrado.", accionUI: { type: "show_all_medications" } };

    case "open_screen": {
      // Solo claves del catálogo: nunca una ruta que arme el modelo.
      const pantalla = pantallaPorClave(input.screen);
      if (!pantalla) {
        return { contenido: "Esa pantalla no existe en la app. Elegí una de la lista de Pantallas de la app." };
      }
      return { contenido: "Botón mostrado.", accionUI: { type: "open_screen", href: pantalla.ruta, label: pantalla.titulo } };
    }

    case "set_avatar_mood": {
      const mood = String(input.mood ?? "neutral");
      // "Ok." nunca se narra — el chat solo muestra accionUI vía SSE, no
      // el contenido de esta tool (mismo mecanismo que show_today_medications).
      return { contenido: "Ok.", accionUI: { type: "avatar_mood", mood } };
    }

    case "proponer_medicion": {
      // Sin efecto en la DB: la pantalla pregunta "¿Lo anoto así?" y recién ahí guarda (guardarMedicionSimpleAction).
      const validado = validarMedicion({ tipo: input.tipo, valor: input.valor, valorSecundario: input.valor_secundario });
      if (!validado.ok) {
        return { contenido: `No es una medición válida: ${validado.message} No la propongas; pedile con tus palabras que la repita.` };
      }
      const d = validado.datos;
      return {
        contenido: "Propuesta mostrada: la pantalla le pregunta si la anota. NO digas que quedó anotada; pedile que confirme en la pantalla.",
        accionUI: { type: "medicion_propuesta", tipo: d.tipo, valor: d.valor, valorSecundario: d.valorSecundario },
      };
    }

    case "pedir_ayuda_familia": {
      // Aviso real a los cuidadores aceptados de QUIEN CHATEA (nunca de otra persona). El texto para el
      // modelo dice con precisión si se avisó o no; la acción solo sale si el servidor lo confirmó.
      const motivo = typeof input.motivo === "string" ? input.motivo : "";
      const resultado = await pedirAyudaAFamilia(supabase, usuarioId, motivo);
      return { contenido: textoPedidoAyudaParaModelo(resultado), accionUI: accionPedidoAyuda(resultado) };
    }

    default:
      return { contenido: `Tool desconocida: ${nombre}` };
  }
}

// Traduce un medicamento al vocabulario en inglés de las tools antes de
// devolverlo al modelo — mismo mapeo que usan los inputs, en la dirección
// contraria. Todo string que escribió un usuario pasa por limpiarDato (como el
// contexto del prompt): un resultado de tool es DATO, nunca una instrucción.
// (Esta rama no tiene tools de mediciones/estudios/listas de familia; si se
// agregan, sus strings también van por limpiarDato.)
function paraModelo(m: Medicamento | MedicamentoConToma) {
  return {
    id: m.id,
    name: limpiarDato(m.nombre),
    dose: m.dosis ? limpiarDato(m.dosis, 20) : m.dosis,
    scheduled_time: m.hora_programada,
    time_of_day: momentoDiaAIngles(m.momento_dia),
    condition: m.condicion ? limpiarDato(m.condicion) : m.condicion,
    recurring_days: diasAIngles(m.dias_recurrentes),
    meal_indication: indicacionDeComida(m),
    ...("tomado" in m ? { taken: m.tomado } : {}),
  };
}
