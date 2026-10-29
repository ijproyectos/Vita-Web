// Definiciones de las tools del chat (nombre, descripción, schema). Sin `server-only` ni I/O:
// las importan la ejecución (tools.ts) y el runner de evals, así hay una sola copia.
// El orden del array es parte del prefijo cacheado por Anthropic: no reordenar sin motivo.
import type Anthropic from "@anthropic-ai/sdk";
import { CLAVES_INDICACION, INDICACIONES_COMIDA } from "@/lib/medicamentos/comidas";
import { GENEROS, GRUPOS_SANGUINEOS } from "@/lib/perfil/opciones";
import { CLAVES_PANTALLAS } from "./guia-app";
import { TOOLS_CON_DESTINO, TOOLS_DE_ESCRITURA } from "./destino";

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

// Tools que SOLO existen en el chat de modo simple (`modo: "simple"` en /api/chat). No están en TOOLS: en el
// modo normal no se ofrecen ni se ejecutan (ver lib/ai/modo-simple.ts).
export const TOOL_PEDIR_AYUDA_FAMILIA: Anthropic.Tool = {
  name: "pedir_ayuda_familia",
  description:
    "Le manda un aviso REAL (notificación en el celular) a los familiares que cuidan a quien te habla. Llamala cuando diga que se siente mal, cuente un síntoma, pida ayuda o pida que avisen a su familia o que le saquen un turno. El resultado dice si se avisó o no y a quién: contale a la persona SOLO eso, nunca afirmes que avisaste si el resultado no lo confirma. Se puede enviar como máximo un aviso cada 15 minutos.",
  input_schema: {
    type: "object",
    properties: {
      motivo: {
        type: "string",
        description: "Qué le pasa o qué pidió, con sus palabras, en una frase corta (ej. 'Se siente mareado'). Máx. 140 caracteres.",
      },
    },
    required: ["motivo"],
  },
};

export const TOOL_PROPONER_MEDICION: Anthropic.Tool = {
  name: "proponer_medicion",
  description:
    "No guarda nada: le propone a la pantalla anotar una medición que la persona acaba de decir (glucosa o presión) y la pantalla le pregunta '¿Lo anoto así?'. Nunca digas que quedó anotada. Glucemia: valor en mg/dL ('me dio 110'). Presión: valor = máxima y valor_secundario = mínima ('13 y 8' = 130 y 80).",
  input_schema: {
    type: "object",
    properties: {
      tipo: { type: "string", enum: ["glucemia", "presion"] },
      valor: { type: "number", description: "Glucemia en mg/dL, o la presión máxima en mmHg." },
      valor_secundario: { type: "number", description: "Solo presión: la mínima en mmHg." },
    },
    required: ["tipo", "valor"],
  },
};
