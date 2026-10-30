import "server-only";

// NOT WIRED to the chat or any UI right now (owner decision 2026-10-29): the simple-mode chat no longer
// notifies caregivers; vita just tells the person to call family / 107. Kept in case the feature comes back.

import type { SupabaseClient } from "@supabase/supabase-js";
import { listarMisCuidadores } from "@/lib/familia/nucleo";
import { nombreConMayuscula } from "@/lib/perfil/formato";
import { createAdminClient } from "@/lib/supabase/admin";
import { crearAviso } from "./avisos";
import { enviarPush } from "./push";
import { payloadPedidoAyuda } from "./mensajes";
import {
  destinatariosDelRepetido,
  esPedidoRepetido,
  limpiarMotivo,
  MINUTOS_ENTRE_PEDIDOS_AYUDA,
  normalizarMotivo,
  superaTopePedidos,
  TIMEOUT_ENTREGA_AYUDA_MS,
  type AvisoReciente,
  type ResultadoPedidoAyuda,
} from "./pedido-ayuda-logica";

type Cliente = SupabaseClient;

export type { ResultadoPedidoAyuda } from "./pedido-ayuda-logica";

/**
 * "Pedir ayuda a mi familia": la persona (por voz, en modo simple) avisa a TODOS
 * sus cuidadores aceptados con un aviso en su feed + push.
 *
 * Uso sancionado del cliente admin (ver `lib/supabase/admin.ts`): los avisos y las
 * suscripciones push son del cuidador, la persona no puede escribirlos con su sesión.
 * El admin se crea RECIÉN después de validar con el cliente de SESIÓN quiénes son sus
 * cuidadores (RPC `listar_mis_cuidadores`, solo vínculos aceptados de ESTA persona);
 * `usuarioId` sale de la sesión, nunca del modelo ni del cliente.
 *
 * Tope: no se repite el MISMO motivo dentro de la ventana (MINUTOS_ENTRE_PEDIDOS_AYUDA) por persona,
 * consultando `avisos` (sin tabla nueva), y como máximo MAX_PEDIDOS_AYUDA_POR_VENTANA pedidos en esa
 * ventana sea cual sea el motivo. Mismo motivo = "repetido" (nombra a quienes ya recibieron); tope con un
 * motivo NUEVO = "tope" (no se mandó nada: nunca se afirma una entrega que no ocurrió). Un motivo
 * distinto (escalada) se entrega mientras no se llegue a ese tope. Un cuidador cuenta como avisado apenas
 * se confirma la fila del feed; el plazo (TIMEOUT_ENTREGA_AYUDA_MS) aplica solo al push posterior, para que
 * uno lento no pase el timeout del cliente. Si la consulta falla se envía igual:
 * es un pedido explícito de ayuda y un push duplicado es el fallo más barato.
 * Best-effort ante concurrencia (dos pedidos simultáneos podrían pasar los dos).
 * "enviado" solo si se escribió al menos una fila del feed. Nunca lanza.
 */
export async function pedirAyudaAFamilia(
  supabase: Cliente,
  usuarioId: string,
  motivoCrudo: string
): Promise<ResultadoPedidoAyuda> {
  try {
    const cuidadores = await listarMisCuidadores(supabase);
    if (cuidadores.length === 0) return { status: "sin-cuidadores" };

    const motivo = limpiarMotivo(motivoCrudo);
    const { data: perfil } = await supabase.from("perfiles").select("nombre").eq("id", usuarioId).maybeSingle();
    const nombrePersona = (perfil?.nombre as string | null | undefined)?.trim();
    const primerNombre = nombrePersona ? nombreConMayuscula(nombrePersona.split(/\s+/)[0]) : "Tu familiar";

    // Autorización resuelta: recién ahora el cliente admin.
    const admin = createAdminClient();
    const nombresTodos = cuidadores.map((c) => c.nombre);

    // `datos.personaId` (siempre existe) en vez de la columna persona_id: no depende de la migración 028.
    const desde = new Date(Date.now() - MINUTOS_ENTRE_PEDIDOS_AYUDA * 60_000).toISOString();
    const { data: filas, error: errorRecientes } = await admin
      .from("avisos")
      .select("usuario_id, datos")
      .eq("tipo", "pedido_ayuda")
      .contains("datos", { personaId: usuarioId })
      .gte("created_at", desde)
      .limit(50);
    // Fail open: si no se pudo verificar, se manda igual (ver el comentario de la función).
    const recientes: AvisoReciente[] = errorRecientes
      ? []
      : ((filas ?? []) as { usuario_id: string; datos: { motivoClave?: unknown } | null }[]).map((f) => ({
          destinatarioId: f.usuario_id,
          motivoClave: typeof f.datos?.motivoClave === "string" ? f.datos.motivoClave : null,
        }));
    const tope = superaTopePedidos(recientes);
    if (esPedidoRepetido(recientes, motivo)) {
      const ids = new Set(destinatariosDelRepetido(recientes, motivo));
      const previos = cuidadores.filter((c) => ids.has(c.cuidadorId)).map((c) => c.nombre);
      return { status: "repetido", nombres: previos.length > 0 ? previos : nombresTodos };
    }
    if (tope) return { status: "tope" };

    const payload = payloadPedidoAyuda({ personaId: usuarioId, personaNombre: primerNombre, motivo });
    const entregas = await Promise.all(
      cuidadores.map(async (c) => {
        try {
          const feed = await crearAviso(admin, c.cuidadorId, {
            tipo: "pedido_ayuda",
            titulo: payload.title,
            cuerpo: payload.body,
            url: payload.url,
            datos: { personaId: usuarioId, motivoClave: normalizarMotivo(motivo) },
            personaId: usuarioId,
          });
          if (!feed) return null;
          // From here on the caregiver counts as notified (the feed row exists); the push is best-effort.
          const push = enviarPush(admin, c.cuidadorId, payload);
          push.catch(() => {}); // if it loses the race, don't leave an unhandled rejection
          let reloj: ReturnType<typeof setTimeout> | undefined;
          const plazo = new Promise<"plazo">((resolve) => {
            reloj = setTimeout(() => resolve("plazo"), TIMEOUT_ENTREGA_AYUDA_MS);
          });
          try {
            const r = await Promise.race([push, plazo]);
            if (r === "plazo") console.warn("pedir_ayuda_familia: push timed out (feed row already saved)");
          } catch {
            console.warn("pedir_ayuda_familia: push failed (feed row already saved)");
          } finally {
            clearTimeout(reloj);
          }
          return c.nombre;
        } catch {
          return null;
        }
      })
    );
    const entregados = entregas.filter((n): n is string => n !== null);
    if (entregados.length === 0) return { status: "error", message: "No pudimos avisar a tu familia." };
    return { status: "enviado", nombres: entregados };
  } catch {
    return { status: "error", message: "No pudimos avisar a tu familia." };
  }
}
