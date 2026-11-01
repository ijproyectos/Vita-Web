import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  bloqueadoPorFallos,
  claveFallosCanje,
  esResultadoCanje,
  hashCodigo,
  inicioVentanaCanje,
  leerSecretoCodigos,
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
 * Freno: máx. 5 intentos por usuario cada 15 minutos (ventana fija en `limites_pedidos`, vía `contar_pedido`, que
 * incrementa y devuelve la cuenta en una sola sentencia). Falla CERRADO si el freno no se puede leer: un código de vita+ vale
 * plata, y con la base caída no se canjea igual. El mensaje al usuario es genérico.
 */
export async function canjearCodigoVitaPlus(usuarioId: string, codigoCrudo: string): Promise<ResultadoCanjeServidor> {
  try {
    const admin = createAdminClient();
    const ahora = Date.now();
    const ventana = inicioVentanaCanje(ahora).toISOString();
    const clave = claveFallosCanje(usuarioId);

    // Incremento atómico y después chequeo: cuenta TODOS los intentos de la ventana (5 por 15 minutos), así dos
    // pedidos en paralelo no pueden pasar ambos por un "leer y después sumar". Falla cerrado si no se puede contar.
    const { data: cuenta, error: errorConteo } = await admin.rpc("contar_pedido", { p_clave: clave, p_ventana_inicio: ventana });
    if (errorConteo || typeof cuenta !== "number") return { ok: false, http: 503, mensaje: "No pudimos canjear el código. Probá de nuevo." };
    if (bloqueadoPorFallos(cuenta)) return { ok: false, http: 429, mensaje: MENSAJE_DEMASIADOS_INTENTOS };

    const secreto = leerSecretoCodigos();
    if (!secreto) return { ok: false, http: 503, mensaje: "No pudimos canjear el código. Probá de nuevo." };

    const normalizado = normalizarCodigo(codigoCrudo.slice(0, 64));
    if (!tieneFormaDeCodigo(normalizado)) return { ok: false, http: 400, mensaje: MENSAJE_CODIGO_INVALIDO };

    const { data, error } = await admin.rpc("canjear_codigo_vita_plus", {
      p_usuario: usuarioId,
      p_hash: hashCodigo(normalizado, secreto),
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
    return { ok: false, http: 400, mensaje: mensajeCanje(resultado) };
  } catch {
    return { ok: false, http: 503, mensaje: "No pudimos canjear el código. Probá de nuevo." };
  }
}
