import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { TOOLS, ejecutarTool } from "@/lib/ai/tools";
import * as chat from "@/lib/chat/nucleo";

export const runtime = "nodejs";

// Chat interactivo, no generación larga (a diferencia de `claude-opus-5`
// que usa NutrIA para el plan alimentario) — sonnet es el punto justo de
// latencia/calidad para una conversación con tool-calling.
const MODEL = "claude-sonnet-5";
const MAX_TURNOS_TOOL_USE = 6;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Sos el asistente de salud de Vitapp. Ayudás al usuario a gestionar sus
medicamentos: ver qué le toca hoy, agregar uno nuevo, cambiar un horario,
marcar que lo tomó, o eliminarlo.

Reglas:
- Respondé siempre en español, tono breve y directo.
- Nunca inventes datos de medicamentos — usá las tools para leer o escribir,
  nunca asumas qué tiene cargado el usuario.
- Cuando el usuario pida "ver" sus medicamentos (hoy o todos), después de
  responder en texto llamá también a la tool show_today_medications o
  show_all_medications correspondiente para que la interfaz muestre la lista.
- Si una tool devuelve que no encontró un medicamento por nombre, decíselo
  al usuario y preguntale el nombre exacto en vez de reintentar a ciegas.`;

function eventoSSE(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response("No autenticado.", { status: 401 });
  }

  const { sesionId: sesionIdEntrante, mensaje } = (await request.json()) as {
    sesionId?: string;
    mensaje: string;
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const enviar = (data: unknown) => controller.enqueue(encoder.encode(eventoSSE(data)));
      // "[DONE]" es un sentinel literal, no JSON — mismo contrato que el
      // agente original (`agent/README.md`: "data: [DONE]", sin comillas).
      const enviarFin = () => controller.enqueue(encoder.encode("data: [DONE]\n\n"));

      let textoAcumulado = ""; // se persiste como UN mensaje del asistente al final,
      // igual a como el cliente lo muestra en una sola burbuja.

      try {
        // Un sesionId entrante solo se usa si de verdad es del usuario —
        // ver el comentario en sesionPerteneceAUsuario(). Si no matchea
        // (URL manipulada a mano, o la sesión ya no existe), se trata
        // igual que "sin sesionId": se crea una nueva y se le avisa al
        // cliente cuál es la real.
        const sesionValida =
          !!sesionIdEntrante && (await chat.sesionPerteneceAUsuario(supabase, user.id, sesionIdEntrante));
        const sesionId = sesionValida
          ? sesionIdEntrante!
          : await chat.crearSesion(supabase, user.id);
        if (!sesionValida) enviar({ session: sesionId });

        await chat.guardarMensaje(supabase, user.id, sesionId, "user", mensaje);

        // El historial se reconstruye SIEMPRE desde la DB (fuente de
        // verdad), nunca se confía en lo que mande el cliente.
        const mensajesGuardados = await chat.listarMensajes(supabase, user.id, sesionId);
        const historial: Anthropic.MessageParam[] = mensajesGuardados.map((m) => ({
          role: m.role,
          content: m.contenido,
        }));

        for (let turno = 0; turno < MAX_TURNOS_TOOL_USE; turno++) {
          const respuesta = anthropic.messages.stream({
            model: MODEL,
            max_tokens: 1024,
            system: SYSTEM_PROMPT,
            tools: TOOLS,
            messages: historial,
          });

          respuesta.on("text", (texto) => {
            textoAcumulado += texto;
            enviar({ chunk: texto });
          });

          const mensajeFinal = await respuesta.finalMessage();
          historial.push({ role: "assistant", content: mensajeFinal.content });

          if (mensajeFinal.stop_reason !== "tool_use") break;

          const usosDeTool = mensajeFinal.content.filter(
            (bloque): bloque is Anthropic.ToolUseBlock => bloque.type === "tool_use"
          );

          const resultadosTool: Anthropic.ToolResultBlockParam[] = [];
          for (const uso of usosDeTool) {
            const resultado = await ejecutarTool(
              uso.name,
              uso.input as Record<string, unknown>,
              { supabase, usuarioId: user.id }
            );
            if (resultado.accionUI) enviar({ action: resultado.accionUI });
            resultadosTool.push({
              type: "tool_result",
              tool_use_id: uso.id,
              content: resultado.contenido,
            });
          }

          historial.push({ role: "user", content: resultadosTool });
        }

        if (textoAcumulado) {
          await chat.guardarMensaje(supabase, user.id, sesionId, "assistant", textoAcumulado);
        }

        enviarFin();
      } catch (e) {
        enviar({ error: e instanceof Error ? e.message : "Error desconocido." });
        enviarFin();
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
