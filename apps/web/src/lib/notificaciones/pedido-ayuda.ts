import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { listarMisCuidadores } from "@/lib/familia/nucleo";
import { nombreConMayuscula } from "@/lib/perfil/formato";
import { createAdminClient } from "@/lib/supabase/admin";
import { entregarAviso } from "./avisos";
import { payloadPedidoAyuda } from "./mensajes";
import { limpiarMotivo, MINUTOS_ENTRE_PEDIDOS_AYUDA, type ResultadoPedidoAyuda } from "./pedido-ayuda-logica";

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
 * Tope: un pedido cada 15 min por persona, consultando `avisos` (sin tabla nueva).
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
    const { data: recientes, error: errorRecientes } = await admin
      .from("avisos")
      .select("id")
      .eq("tipo", "pedido_ayuda")
      .contains("datos", { personaId: usuarioId })
      .gte("created_at", desde)
      .limit(1);
    if (errorRecientes) return { status: "error", message: "No pudimos verificar el pedido." };
    if ((recientes ?? []).length > 0) return { status: "repetido", nombres: nombresTodos };

    const payload = payloadPedidoAyuda({ personaId: usuarioId, personaNombre: primerNombre, motivo });
    const entregas = await Promise.all(
      cuidadores.map(async (c) => {
        try {
          const { feed } = await entregarAviso(
            admin,
            c.cuidadorId,
            {
              tipo: "pedido_ayuda",
              titulo: payload.title,
              cuerpo: payload.body,
              url: payload.url,
              datos: { personaId: usuarioId },
              personaId: usuarioId,
            },
            payload
          );
          return feed ? c.nombre : null;
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
