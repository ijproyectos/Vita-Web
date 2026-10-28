import "server-only";

import { hashIp } from "@/lib/acceso-codigo/nucleo";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  claveLimite,
  inicioVentana,
  ipDeHeaders,
  MENSAJE_LIMITE_PEDIDOS,
  MENSAJE_LIMITE_PEDIDOS_DIA,
  segundosHastaFinDeVentana,
  superaLimite,
  type Limite,
} from "./logica";

export type ResultadoLimitePedidos = { ok: true } | { ok: false; mensaje: string; reintentarEnSegundos: number };

/**
 * Cuenta un pedido contra cada límite y dice si se pasó. Falla ABIERTO: si la tabla no existe (035 sin
 * aplicar) o la DB falla, deja pasar (el límite diario de tokens sigue protegiendo el costo); el log no
 * lleva datos del usuario. Las ventanas de minuto se cuentan primero y la diaria solo si pasaron, para
 * que los pedidos rechazados por ráfaga no se coman el cupo del día.
 *
 * Usa service_role (RLS sin policies), mismo patrón sancionado que `registrarUsoIA` / `registrarRespuestaChat`:
 * se llama DESPUÉS de autenticar la sesión; el usuario sale de esa sesión, nunca del cliente. La IP se
 * hashea con HMAC (`hashIp`, el mismo helper y secreto que el throttling de `intentos_codigo`).
 */
export async function verificarLimitePedidos(args: {
  usuarioId: string;
  headers: Headers;
  limites: Limite[];
}): Promise<ResultadoLimitePedidos> {
  try {
    const admin = createAdminClient();
    const ahora = Date.now();
    const ip = ipDeHeaders(args.headers);
    // Sin IP conocida no hay límite por IP (hashear un valor fijo juntaría a todos los desconocidos).
    const aplicables = args.limites.filter((l) => l.sujeto === "u" || ip !== null);

    const contar = async (l: Limite): Promise<boolean> => {
      const sujetoId = l.sujeto === "u" ? args.usuarioId : hashIp(ip as string);
      const { data, error } = await admin.rpc("contar_pedido", {
        p_clave: claveLimite(l, sujetoId),
        p_ventana_inicio: inicioVentana(ahora, l.ventana).toISOString(),
      });
      if (error || typeof data !== "number") {
        console.warn("limites_pedidos: no se pudo contar", error?.code ?? "");
        return false; // fail open
      }
      return superaLimite(data, l.maximo);
    };

    for (const grupo of [aplicables.filter((l) => l.ventana === "min"), aplicables.filter((l) => l.ventana === "dia")]) {
      const pasadas = await Promise.all(grupo.map(contar));
      const i = pasadas.indexOf(true);
      if (i !== -1) {
        const l = grupo[i];
        return {
          ok: false,
          mensaje: l.ventana === "dia" ? MENSAJE_LIMITE_PEDIDOS_DIA : MENSAJE_LIMITE_PEDIDOS,
          reintentarEnSegundos: segundosHastaFinDeVentana(ahora, l.ventana),
        };
      }
    }
    return { ok: true };
  } catch {
    console.warn("limites_pedidos: no se pudo verificar el límite");
    return { ok: true };
  }
}
