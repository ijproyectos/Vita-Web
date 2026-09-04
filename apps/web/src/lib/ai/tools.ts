import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import * as medicamentos from "@/lib/medicamentos/nucleo";
import type { Medicamento, MedicamentoConToma } from "@/lib/medicamentos/tipos";
import {
  diasAIngles,
  diasDesdeIngles,
  momentoDiaAIngles,
  momentoDiaDesdeIngles,
} from "./mapeo";

// Tools portadas 1:1 desde `agent/README.md` del Vitapp original (el
// agente LangGraph + MCP), acotadas al módulo en alcance (medicamentos).
// Ahí corrían como llamadas MCP a `vita_back`; acá llaman directo a
// `lib/medicamentos/nucleo.ts` en el mismo proceso — mismo resultado,
// sin el subproceso ni el JWT intermedio (el `usuarioId` ya viene resuelto
// de la sesión de Supabase, nunca del modelo).
export const TOOLS: Anthropic.Tool[] = [
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
        time_of_day: { type: "string", enum: ["morning", "midday", "night"] },
        condition: { type: "string", description: "Para qué condición es, opcional." },
        recurring_days: {
          type: "array",
          items: {
            type: "string",
            enum: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
          },
          description: "Días de la semana en que aplica. Vacío u omitido = todos los días.",
        },
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
        scheduled_time: { type: "string", description: "Nueva hora en formato HH:MM." },
        time_of_day: { type: "string", enum: ["morning", "midday", "night"] },
        recurring_days: {
          type: "array",
          items: {
            type: "string",
            enum: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
          },
        },
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
];

export type AccionUI = { type: string; [clave: string]: unknown };

export type ResultadoTool = {
  contenido: string; // lo que vuelve al modelo como tool_result
  accionUI?: AccionUI; // si corresponde, se emite como evento SSE {action}
};

export async function ejecutarTool(
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
      const creado = await medicamentos.agregar(supabase, usuarioId, {
        nombre: String(input.name),
        dosis: (input.dose as string) ?? null,
        horaProgramada: String(input.scheduled_time),
        momentoDia: momentoDiaDesdeIngles(String(input.time_of_day)),
        condicion: (input.condition as string) ?? null,
        diasRecurrentes: input.recurring_days
          ? diasDesdeIngles(input.recurring_days as string[])
          : [],
      });
      return { contenido: JSON.stringify(paraModelo(creado)) };
    }

    case "update_schedule": {
      const medicamento = await medicamentos.buscarPorNombre(
        supabase,
        usuarioId,
        String(input.medication_name)
      );
      if (!medicamento) return { contenido: `No encontré un medicamento llamado "${input.medication_name}".` };

      const actualizado = await medicamentos.actualizarHorario(supabase, usuarioId, medicamento.id, {
        horaProgramada: input.scheduled_time as string | undefined,
        momentoDia: input.time_of_day ? momentoDiaDesdeIngles(String(input.time_of_day)) : undefined,
        diasRecurrentes: input.recurring_days
          ? diasDesdeIngles(input.recurring_days as string[])
          : undefined,
      });
      return { contenido: JSON.stringify(paraModelo(actualizado)) };
    }

    case "delete_schedule": {
      const medicamento = await medicamentos.buscarPorNombre(
        supabase,
        usuarioId,
        String(input.medication_name)
      );
      if (!medicamento) return { contenido: `No encontré un medicamento llamado "${input.medication_name}".` };

      await medicamentos.eliminarHorario(supabase, usuarioId, medicamento.id);
      return { contenido: `Eliminado "${medicamento.nombre}".`, accionUI: { type: "medication_deleted" } };
    }

    case "mark_taken": {
      const medicamento = await medicamentos.buscarPorNombre(
        supabase,
        usuarioId,
        String(input.medication_name)
      );
      if (!medicamento) return { contenido: `No encontré un medicamento llamado "${input.medication_name}".` };

      await medicamentos.marcarTomado(supabase, usuarioId, medicamento.id, true);
      return {
        contenido: `Marcado "${medicamento.nombre}" como tomado.`,
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

    case "show_today_medications":
      return { contenido: "Mostrado.", accionUI: { type: "show_today_medications" } };

    case "show_all_medications":
      return { contenido: "Mostrado.", accionUI: { type: "show_all_medications" } };

    default:
      return { contenido: `Tool desconocida: ${nombre}` };
  }
}

// Traduce un medicamento al vocabulario en inglés de las tools antes de
// devolverlo al modelo — mismo mapeo que usan los inputs, en la dirección
// contraria.
function paraModelo(m: Medicamento | MedicamentoConToma) {
  return {
    id: m.id,
    name: m.nombre,
    dose: m.dosis,
    scheduled_time: m.hora_programada,
    time_of_day: momentoDiaAIngles(m.momento_dia),
    condition: m.condicion,
    recurring_days: diasAIngles(m.dias_recurrentes),
    ...("tomado" in m ? { taken: m.tomado } : {}),
  };
}
