import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import * as medicamentos from "@/lib/medicamentos/nucleo";
import { indicacionDeComida, type Medicamento, type MedicamentoConToma } from "@/lib/medicamentos/tipos";
import { CLAVES_INDICACION, esIndicacionComida, INDICACIONES_COMIDA, type IndicacionComida } from "@/lib/medicamentos/comidas";
import * as turnos from "@/lib/turnos/nucleo";
import * as perfilNucleo from "@/lib/perfil/nucleo";
import type { CambiosPerfil } from "@/lib/perfil/tipos";
import { GENEROS, GRUPOS_SANGUINEOS } from "@/lib/perfil/opciones";
import type { MiembroFamilia } from "@/lib/familia/tipos";
import { momentoDelDia } from "@/lib/rutina/momento";
import { fechaDeHoyISO } from "@/lib/rutina/formato";
import {
  diasAIngles,
  diasDesdeIngles,
  momentoDiaAIngles,
  momentoDiaDesdeIngles,
} from "./mapeo";
import { CLAVES_PANTALLAS, pantallaPorClave } from "./guia-app";
import { limpiarDato } from "./limpiar";
import { mensajeFaltaConfirmacion, opcionesConfirmarPara, resolverDestino, TOOLS_CON_DESTINO, TOOLS_DE_ESCRITURA } from "./destino";

// Tools portadas 1:1 desde `agent/README.md` del Vitapp original (el
// agente LangGraph + MCP), acotadas al módulo en alcance (medicamentos).
// Ahí corrían como llamadas MCP a `vita_back`; acá llaman directo a
// `lib/medicamentos/nucleo.ts` en el mismo proceso — mismo resultado,
// sin el subproceso ni el JWT intermedio (el `usuarioId` ya viene resuelto
// de la sesión de Supabase, nunca del modelo).
//
// Indicación de comida opcional de add_medication / update_schedule: SOLO las
// opciones del catálogo (lib/medicamentos/comidas.ts), con su etiqueta en la descripción.
const PROPIEDAD_INDICACION_COMIDA = {
  type: "string" as const,
  enum: CLAVES_INDICACION,
  description: `Indicación de comida opcional: solo una de estas opciones, nunca inventes otra. ${INDICACIONES_COMIDA.map((o) => `${o.clave} = "${o.etiqueta}"`).join("; ")}. Es una observación: la hora (scheduled_time) es la que manda.`,
};

// En update_schedule además se puede borrar la indicación ("none").
const PROPIEDAD_INDICACION_COMIDA_EDITABLE = {
  ...PROPIEDAD_INDICACION_COMIDA,
  enum: [...CLAVES_INDICACION, "none"],
  description: `${PROPIEDAD_INDICACION_COMIDA.description} "none" = quitar la indicación.`,
};

const sinTildes = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

/**
 * Lo que mandó el modelo como indicación: clave del catálogo o su etiqueta
 * (la que ve en los listados, ej. "Con el desayuno"). undefined = no la mandó;
 * null = "none"; "invalida" = algo fuera del catálogo (no se guarda en silencio).
 */
function leerIndicacionDelModelo(valor: unknown): IndicacionComida | null | undefined | "invalida" {
  if (valor === undefined || valor === null || valor === "") return undefined;
  if (typeof valor !== "string") return "invalida";
  if (sinTildes(valor) === "none") return null;
  if (esIndicacionComida(valor)) return valor;
  return INDICACIONES_COMIDA.find((o) => sinTildes(o.etiqueta) === sinTildes(valor))?.clave ?? "invalida";
}

const ERROR_INDICACION = `ERROR: esa indicación de comida no existe. No se guardó nada. Usá una de: ${INDICACIONES_COMIDA.map((o) => `${o.clave} ("${o.etiqueta}")`).join(", ")}, o preguntale al usuario cuál es.`;

// Familia (021): cada tool de datos acepta un `persona_id` opcional. Ausente =
// la cuenta logueada (nunca el perfil activo de la UI: eso es solo contexto
// para el prompt). Si viene, `resolverDestino` (lib/ai/destino.ts) lo valida
// contra los vínculos reales y, para escribir en otra persona, exige rol
// `editar` y confirmación explícita. La RLS sigue siendo la autoridad final.
const TOOLS_BASE: Anthropic.Tool[] = [
  {
    name: "list_today_medications",
    description: "Lista los medicamentos programados para hoy, con si ya se tomaron o no.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "list_all_medications",
    description: "Lista todos los medicamentos del usuario, programados o no para hoy.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "add_medication",
    description: "Crea un medicamento nuevo con su horario.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Nombre del medicamento." },
        dose: { type: "string", description: "Dosis, ej. '400mg'." },
        scheduled_time: { type: "string", description: "Hora en formato HH:MM." },
        time_of_day: { type: "string", enum: ["morning", "midday", "afternoon", "night"] },
        condition: { type: "string", description: "Para qué condición es, opcional." },
        recurring_days: {
          type: "array",
          items: {
            type: "string",
            enum: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
          },
          description: "Días de la semana en que aplica. Vacío u omitido = todos los días.",
        },
        meal_indication: PROPIEDAD_INDICACION_COMIDA,
      },
      required: ["name", "scheduled_time", "time_of_day"],
    },
  },
  {
    name: "update_schedule",
    description: "Actualiza la hora, el momento del día y/o los días de un medicamento existente.",
    input_schema: {
      type: "object",
      properties: {
        medication_name: { type: "string", description: "Nombre (o parte del nombre) del medicamento a actualizar." },
        medication_time_hint: {
          type: "string",
          description:
            "Hora actual (HH:MM) de ESE medicamento, solo si el usuario tiene más de uno con el mismo nombre (ej. la misma pastilla de mañana y de noche) — para saber cuál de los dos actualizar. Omitir si no aplica.",
        },
        scheduled_time: { type: "string", description: "Nueva hora en formato HH:MM." },
        time_of_day: { type: "string", enum: ["morning", "midday", "afternoon", "night"] },
        recurring_days: {
          type: "array",
          items: {
            type: "string",
            enum: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
          },
        },
        meal_indication: PROPIEDAD_INDICACION_COMIDA_EDITABLE,
      },
      required: ["medication_name"],
    },
  },
  {
    name: "delete_schedule",
    description: "Elimina un medicamento (y su historial de tomas) por nombre.",
    input_schema: {
      type: "object",
      properties: {
        medication_name: { type: "string" },
        medication_time_hint: {
          type: "string",
          description:
            "Hora actual (HH:MM) de ESE medicamento, solo si el usuario tiene más de uno con el mismo nombre — para saber cuál de los dos borrar. Omitir si no aplica.",
        },
      },
      required: ["medication_name"],
    },
  },
  {
    name: "mark_taken",
    description: "Marca un medicamento como tomado hoy, buscándolo por nombre.",
    input_schema: {
      type: "object",
      properties: {
        medication_name: { type: "string" },
        medication_time_hint: {
          type: "string",
          description:
            "Hora actual (HH:MM) de ESE medicamento, solo si el usuario tiene más de uno con el mismo nombre — para saber cuál de los dos marcar. Omitir si no aplica.",
        },
      },
      required: ["medication_name"],
    },
  },
  {
    name: "mark_all_taken",
    description: "Marca todos los medicamentos pendientes de hoy como tomados.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "add_appointment",
    description: "Agenda un turno médico nuevo.",
    input_schema: {
      type: "object",
      properties: {
        specialty: { type: "string", description: "Especialidad, ej. 'Cardiología'." },
        professional: { type: "string", description: "Nombre del profesional, opcional." },
        place: { type: "string", description: "Lugar/institución, opcional." },
        date: { type: "string", description: "Fecha en formato YYYY-MM-DD." },
        time: { type: "string", description: "Hora en formato HH:MM." },
        reason: { type: "string", description: "Motivo de la consulta, opcional." },
      },
      required: ["specialty", "date", "time"],
    },
  },
  {
    name: "list_today_appointments",
    description: "Lista los turnos médicos agendados para hoy.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "update_health_profile",
    description:
      "Actualiza datos del perfil de salud del usuario (género, grupo sanguíneo, altura, peso, obra social). Solo actualiza los campos que vengan, el resto queda igual.",
    input_schema: {
      type: "object",
      properties: {
        gender: { type: "string", enum: [...GENEROS], description: "Género." },
        blood_type: { type: "string", enum: [...GRUPOS_SANGUINEOS], description: "Grupo sanguíneo." },
        height_cm: { type: "number", description: "Altura en centímetros." },
        weight_kg: { type: "number", description: "Peso en kilogramos." },
        health_insurance: { type: "string", description: "Obra social o prepaga." },
      },
    },
  },
  {
    name: "add_condition",
    description: "Agrega una condición de salud (ej. hipertensión, diabetes) al perfil del usuario.",
    input_schema: {
      type: "object",
      properties: {
        label: { type: "string", description: "Nombre de la condición, ej. 'Hipertensión'." },
        type: { type: "string", enum: ["permanent", "temporary"], description: "Si es permanente o temporal." },
        since: { type: "string", description: "Desde cuándo, ej. '2022' o 'Mar 2026'. Si no se sabe, usar el año actual." },
      },
      required: ["label"],
    },
  },
  {
    name: "add_allergy",
    description: "Agrega una alergia al perfil del usuario.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Nombre de la alergia, ej. 'Penicilina'." },
      },
      required: ["name"],
    },
  },
  {
    name: "show_today_medications",
    description:
      "No consulta datos — le indica a la interfaz que muestre el widget de medicamentos de hoy. Usar después de que el usuario pida ver sus medicamentos de hoy.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "show_all_medications",
    description:
      "No consulta datos — le indica a la interfaz que muestre el widget con todos los medicamentos. Usar cuando el usuario pida ver la lista completa.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "open_screen",
    description:
      "No lee ni cambia datos — le muestra al usuario un botón para abrir una pantalla de la app. Usar cuando pregunte dónde está algo, cómo hacer algo en la app o pida ir a una pantalla. No usar después de una escritura (esas ya muestran su propia tarjeta).",
    input_schema: {
      type: "object",
      properties: {
        screen: {
          type: "string",
          enum: CLAVES_PANTALLAS,
          description: "Clave de la pantalla a abrir, de la lista de Pantallas de la app.",
        },
      },
      required: ["screen"],
    },
  },
  {
    name: "set_avatar_mood",
    description:
      "No consulta ni cambia datos — le indica a la interfaz qué expresión mostrar en el avatar de vita mientras responde. Llamala SIEMPRE, en cada respuesta, además de cualquier otra tool que uses. Elegí el mood según el CONTENIDO de tu respuesta, nunca por palabras clave sueltas: 'happy' para buenas noticias, felicitaciones o logros del usuario; 'empathetic' si el usuario expresa preocupación, tristeza, dolor o dificultad; 'alert' SOLO si hay algo que de verdad requiere atención especial (una dosis vencida hace rato, un dato de salud que suena serio) — no lo uses para avisos triviales; 'calm' cuando estés acompañando o tranquilizando al usuario; 'neutral' para el resto (información de rutina, confirmaciones simples). No exageres: la mayoría de las respuestas son 'neutral'.",
    input_schema: {
      type: "object",
      properties: {
        mood: {
          type: "string",
          enum: ["neutral", "happy", "empathetic", "calm", "alert"],
          description: "La expresión que mejor representa el tono de ESTA respuesta puntual.",
        },
      },
      required: ["mood"],
    },
  },
];

const PROPIEDAD_PERSONA = {
  type: "string",
  description:
    "Id de la persona sobre la que actuar, tomado EXACTAMENTE de la lista de Personas del contexto. Omitir = quien está chateando.",
} as const;

const PROPIEDAD_CONFIRMADO = {
  type: "boolean",
  description:
    "Solo para escribir en OTRA persona: true si el usuario ya confirmó explícitamente, en un mensaje anterior, esta acción exacta para esa persona. Es solo una indicación: el servidor exige su propia confirmación (botones que la app le muestra al usuario) y no ejecuta nada sin ella. No preguntes por texto antes de llamar a la tool: llamala directo con persona_id y el servidor pide la confirmación.",
} as const;

// Suma `persona_id` (y `confirmado` en las de escritura) a las tools con destino.
export const TOOLS: Anthropic.Tool[] = TOOLS_BASE.map((t) => {
  if (!TOOLS_CON_DESTINO.has(t.name)) return t;
  const schema = t.input_schema as { properties?: Record<string, unknown> };
  return {
    ...t,
    input_schema: {
      ...t.input_schema,
      properties: {
        ...(schema.properties ?? {}),
        persona_id: PROPIEDAD_PERSONA,
        ...(TOOLS_DE_ESCRITURA.has(t.name) ? { confirmado: PROPIEDAD_CONFIRMADO } : {}),
      },
    },
  };
});

export type AccionUI = { type: string; [clave: string]: unknown };

export type ResultadoTool = {
  contenido: string; // lo que vuelve al modelo como tool_result
  accionUI?: AccionUI; // si corresponde, se emite como evento SSE {action}
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

  const resultado = await ejecutarEnDestino(nombre, input, { supabase: ctx.supabase, usuarioId: destino.destinoId });
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
      const creado = await medicamentos.agregar(supabase, usuarioId, {
        nombre: String(input.name),
        dosis: (input.dose as string) ?? null,
        horaProgramada: String(input.scheduled_time),
        momentoDia: momentoDelDia(String(input.scheduled_time)),
        condicion: (input.condition as string) ?? null,
        diasRecurrentes: input.recurring_days
          ? diasDesdeIngles(input.recurring_days as string[])
          : [],
        // Solo claves del catálogo: lo que mande el modelo se valida acá, no se guarda tal cual.
        // Se guarda como se pidió, aunque no coincida con la hora habitual de esa comida.
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

    case "update_schedule": {
      const medicamento = await medicamentos.buscarPorNombre(
        supabase,
        usuarioId,
        String(input.medication_name),
        input.medication_time_hint as string | undefined
      );
      if (!medicamento) return { contenido: `No encontré un medicamento llamado "${limpiarDato(String(input.medication_name))}".` };

      const indicacion = leerIndicacionDelModelo(input.meal_indication);
      if (indicacion === "invalida") return { contenido: ERROR_INDICACION };

      // Si viene scheduled_time, momentoDia se re-deriva de esa hora (misma
      // razón que en add_medication) — solo se confía en el time_of_day
      // suelto del modelo cuando no hay una hora nueva de la que derivarlo.
      const actualizado = await medicamentos.actualizarHorario(supabase, usuarioId, medicamento.id, {
        horaProgramada: input.scheduled_time as string | undefined,
        momentoDia: input.scheduled_time
          ? momentoDelDia(String(input.scheduled_time))
          : input.time_of_day
            ? momentoDiaDesdeIngles(String(input.time_of_day))
            : undefined,
        diasRecurrentes: input.recurring_days
          ? diasDesdeIngles(input.recurring_days as string[])
          : undefined,
        // Solo se toca si el modelo la manda ("none" la borra); mover la hora no la cambia.
        indicacion,
      });
      return { contenido: JSON.stringify(paraModelo(actualizado)), accionUI: { type: "schedule_updated" } };
    }

    case "delete_schedule": {
      const medicamento = await medicamentos.buscarPorNombre(
        supabase,
        usuarioId,
        String(input.medication_name),
        input.medication_time_hint as string | undefined
      );
      if (!medicamento) return { contenido: `No encontré un medicamento llamado "${limpiarDato(String(input.medication_name))}".` };

      await medicamentos.eliminarHorario(supabase, usuarioId, medicamento.id);
      return { contenido: `Eliminado "${limpiarDato(medicamento.nombre)}".`, accionUI: { type: "medication_deleted" } };
    }

    case "mark_taken": {
      const medicamento = await medicamentos.buscarPorNombre(
        supabase,
        usuarioId,
        String(input.medication_name),
        input.medication_time_hint as string | undefined
      );
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
