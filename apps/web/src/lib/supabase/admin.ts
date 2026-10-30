import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase con `service_role` — sin cookies, sin sesión de
 * usuario, bypassa RLS por completo. Uso exclusivo de código de sistema
 * (el detector de dosis vencidas y su cron route, Fase 2/3) que necesita
 * leer datos de TODOS los elders con al menos un cuidador vinculado, algo
 * que ninguna sesión de usuario normal puede hacer por diseño (RLS de
 * este proyecto es siempre "solo mis propios datos" o "datos del elder
 * que vinculé como cuidador").
 *
 * Segundo uso SANCIONADO: el acceso por código sin cuenta de Google
 * (`lib/acceso-codigo/nucleo.ts`, invocado solo desde `entrarConCodigoAction`
 * de /login): quien entra todavía no tiene sesión, así que validar el
 * código, crear la cuenta con email placeholder, abrir su sesión y llevar
 * el throttling por IP no se puede hacer con RLS. Siempre detrás del
 * throttling; nunca se loguean códigos ni emails.
 *
 * Otro uso SANCIONADO: los "perfiles gestionados" de Familia
 * (`crearPerfilGestionado` en `lib/familia/nucleo.ts`, invocado solo desde
 * `crearPerfilGestionadoAction` de /app/familia): crear la cuenta de auth de
 * una persona sin celular no se puede con RLS. Crea cuenta → perfil →
 * vínculo aceptado con `cuidador_id` = el usuario ya autenticado por sesión,
 * y borra la cuenta ante cualquier fallo. Nunca recibe ids ajenos del cliente.
 *
 * "Pedir ayuda a mi familia" (`pedirAyudaAFamilia` en `lib/notificaciones/pedido-ayuda.ts`; HOY SIN
 * CONECTAR al chat, decisión del dueño 2026-10-29): escribe el aviso y manda el push a los CUIDADORES de la
 * persona, filas y suscripciones que ella no puede tocar con su sesión. Se crea RECIÉN después de
 * obtener los cuidadores aceptados con el cliente de sesión (`listar_mis_cuidadores`); el id de la
 * persona sale de la sesión, nunca del modelo.
 *
 * Trabajador del resumen de conversación (memoria, fase 3; `lib/memoria/resumen.ts`, invocado solo desde
 * `/api/cron/memoria`, autenticado por `x-cron-secret`): procesa la cola de TODAS las personas (`resumen_conversacion`,
 * sin policies de escritura), lee sus mensajes y guarda el resumen. Cada tarea trabaja solo sobre el `usuario_id` de la
 * fila de la cola, respeta `memoria_activa`, los mensajes excluidos de la memoria y el límite diario en dólares, y las
 * RPC que usa (migración 041) solo las ejecuta service_role. Nunca devuelve texto de mensajes ni de resúmenes.
 *
 * Escritores de contabilidad de SISTEMA (tablas con RLS sin policies, a propósito, para que ni el
 * dueño las lea ni las reescriba): `registrarUsoIA` (`uso_ia_diario`), `registrarRespuestaChat`
 * (`lib/chat/registros.ts`, `registros_chat`: una fila por respuesta de vita con latencia, tokens,
 * nombres de tools y versión del prompt, SIN texto ni datos de salud; la agenda `after()` de
 * `/api/chat`) y `verificarLimitePedidos` (`lib/limites/nucleo.ts`, `limites_pedidos` vía la RPC
 * `contar_pedido`: tope de pedidos por usuario / por IP hasheada con HMAC a `/api/chat` y `/api/voz/*`). Todos se llaman DESPUÉS de que la
 * sesión autenticó al usuario: el `usuario_id` sale de esa sesión, nunca del cliente. La retención de
 * `registros_chat` (90 días) y de `limites_pedidos` (2 días) la hace el cron `dosis-vencidas` (`lib/notificaciones/retencion.ts`).
 *
 * Fuera de esos usos (y de `lib/cuenta/nucleo.ts`, que borra la cuenta
 * del usuario ya autenticado), nunca importar este cliente desde código que
 * atiende una request de un usuario autenticado — para eso están `lib/supabase/{server,client}.ts`,
 * que sí respetan RLS.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
