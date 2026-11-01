import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  bloqueadoPorFallos,
  claveFallosCanje,
  esResultadoCanje,
  hashCodigo,
  inicioVentanaCanje,
  MENSAJE_CODIGO_INVALIDO,
  MENSAJE_DEMASIADOS_INTENTOS,
  mensajeCanje,
  normalizarCodigo,
  tieneFormaDeCodigo,
} from "./codigos";

export type ResultadoCanjeServidor =
  | { ok: true; venceAt: string | null; permanente: boolean }
  | { ok: false; http: number; mensaje: string };

/**
 * Canjea un código de vita+ para la cuenta de la SESIÓN. Quien llama ya autenticó (`getUser`) y pasa el id de esa
 * sesión: nunca un id del cliente. Usa `service_role` porque las tablas de códigos no tienen policies (uso
 * sancionado, ver `lib/supabase/admin.ts`).
 *
 * Freno de intentos fallidos: máx. 5 por usuario cada 15 minutos (ventana fija en `limites_pedidos`, vía
 * `contar_pedido`); los aciertos no cuentan. Falla CERRADO si el freno no se puede leer: un código de vita+ vale
 * plata, y con la base caída no se canjea igual. El mensaje al usuario es genérico.
 */
export async function canjearCodigoVitaPlus(usuarioId: string, codigoCrudo: string): Promise<ResultadoCanjeServidor> {
  try {
    const admin = createAdminClient();
    const ahora = Date.now();
    const ventana = inicioVentanaCanje(ahora).toISOString();
    const clave = claveFallosCanje(usuarioId);

    const { data: previa, error: errorLectura } = await admin
      .from("limites_pedidos")
      .select("cuenta")
      .eq("clave", clave)
      .eq("ventana_inicio", ventana)
      .maybeSingle();
    if (errorLectura) return { ok: false, http: 503, mensaje: "No pudimos canjear el código. Probá de nuevo." };
    if (bloqueadoPorFallos((previa as { cuenta: number } | null)?.cuenta ?? 0)) {
      return { ok: false, http: 429, mensaje: MENSAJE_DEMASIADOS_INTENTOS };
    }

    const registrarFallo = async () => {
      await admin.rpc("contar_pedido", { p_clave: clave, p_ventana_inicio: ventana });
    };

    const normalizado = normalizarCodigo(codigoCrudo.slice(0, 64));
    if (!tieneFormaDeCodigo(normalizado)) {
      await registrarFallo();
      return { ok: false, http: 400, mensaje: MENSAJE_CODIGO_INVALIDO };
    }

    const { data, error } = await admin.rpc("canjear_codigo_vita_plus", {
      p_usuario: usuarioId,
      p_hash: hashCodigo(normalizado),
    });
    if (error) return { ok: false, http: 503, mensaje: "No pudimos canjear el código. Probá de nuevo." };

    const fila = (Array.isArray(data) ? data[0] : data) as
      | { cj_resultado?: unknown; cj_vence_at?: unknown; cj_permanente?: unknown }
      | null
      | undefined;
    const resultado = fila?.cj_resultado;
    if (!esResultadoCanje(resultado)) return { ok: false, http: 503, mensaje: "No pudimos canjear el código. Probá de nuevo." };

    if (resultado === "ok") {
      return {
        ok: true,
        venceAt: typeof fila?.cj_vence_at === "string" ? fila.cj_vence_at : null,
        permanente: fila?.cj_permanente === true,
      };
    }
    // Solo los códigos que no sirven cuentan como fallo; "ya lo canjeaste" no es un intento de adivinar.
    if (resultado !== "ya_canjeado" && resultado !== "ya_permanente") await registrarFallo();
    return { ok: false, http: 400, mensaje: mensajeCanje(resultado) };
  } catch {
    return { ok: false, http: 503, mensaje: "No pudimos canjear el código. Probá de nuevo." };
  }
}
