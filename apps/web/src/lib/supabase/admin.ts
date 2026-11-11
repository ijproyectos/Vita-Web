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
 * "Pedir ayuda a mi familia" (`pedirAyudaAFamilia` en `lib/notificaciones/pedido-ayuda.ts`, tool
 * `pedir_ayuda_familia` del chat de modo simple, decisión del dueño 2026-10-30): escribe el aviso y manda el push a los CUIDADORES de la
 * persona, filas y suscripciones que ella no puede tocar con su sesión. Se crea RECIÉN después de
 * obtener los cuidadores aceptados con el cliente de sesión (`listar_mis_cuidadores`); el id de la
 * persona sale de la sesión, nunca del modelo.
 *
 * "Voy a ir acompañado" de un turno (`avisarTurnoAcompanado` en `lib/notificaciones/turno-acompanado.ts`, llamado desde
 * `lib/turnos/nucleo.ts` tras guardar): escribe el aviso y el push de los CUIDADORES aceptados del dueño del turno. Se
 * crea RECIÉN después de que el cliente de sesión pudo leer el turno recién escrito (RLS); el actor sale de la sesión
 * y no se avisa a sí mismo. Best-effort, nunca bloquea el guardado.
 *
 * Trabajador del resumen de conversación (memoria, fase 3; `lib/memoria/resumen.ts`, invocado solo desde
 * `/api/cron/memoria`, autenticado por `x-cron-secret`): procesa la cola de TODAS las personas (`resumen_conversacion`,
 * sin policies de escritura), lee sus mensajes y guarda el resumen. Cada tarea trabaja solo sobre el `usuario_id` de la
 * fila de la cola, respeta `memoria_activa`, los mensajes excluidos de la memoria y el límite diario en dólares, y las
 * RPC que usa (migración 041) solo las ejecuta service_role. Nunca devuelve texto de mensajes ni de resúmenes.
 *
 * Consolidación nocturna de la memoria (fase 4; `lib/memoria/consolidacion.ts`, invocado solo desde `/api/cron/memoria-consolidacion`,
 * autenticado por `x-cron-secret`): recorre a TODAS las personas con memoria activa, arma un lote de Message Batches con sus
 * recuerdos estables y aplica el resultado. Trabaja sobre `lotes_consolidacion`/`lote_usuarios` (RLS sin policies, a propósito) y
 * toda escritura sobre recuerdos pasa por las RPC de la migración 043, que solo ejecuta service_role y que vuelven a verificar en
 * una transacción la versión de cada recuerdo, la memoria activa y los mensajes excluidos. Los `custom_id` del lote son opacos
 * (nunca el id de la persona). Nunca devuelve texto de recuerdos ni de mensajes.
 *
 * vita+ con Mercado Pago (`lib/vita-plus/nucleo.ts`, migración 044): (1) el webhook público `/api/mercadopago/webhook`,
 * autenticado por la firma `x-signature` (HMAC con `MP_WEBHOOK_SECRET`) ANTES de tocar nada, que re-pide el recurso a
 * Mercado Pago con nuestro token y acredita vita+ solo por un pago aprobado cuyo monto es el guardado para esa
 * suscripción; (2) crear y cancelar la suscripción desde `/api/vita-plus`, DESPUÉS de autenticar la sesión: el
 * `usuario_id` sale de ella, el precio y la cotización los calcula el servidor (el cliente solo manda la clave del
 * plan) y las RPC de escritura de la 044 las ejecuta solo service_role. Nunca devuelve ids ni datos de Mercado Pago.
 * Al dar de baja, guarda además el motivo opcional (`vita_plus_motivos_baja`, migración 059: lista cerrada, sin texto
 * libre) para el `usuario_id` de la sesión, después de cancelar con éxito.
 *
 * Panel de administración `/adminvita` (decisión del dueño 2026-11-01; `lib/admin/datos.ts`): lectura de métricas de TODA la
 * base para los administradores de `ADMIN_EMAILS` (3 personas), y escritura de la auditoría `admin_accesos`. El cliente se crea
 * RECIÉN después de que `requireAdmin()` (`lib/admin/acceso.ts`) validó con la sesión (`getUser`, email confirmado y en la
 * lista) y cada función de datos vuelve a exigirlo. Solo ejecuta las RPC `admin_*` de la migración 045 (service_role, sin texto
 * de usuarios: ni mensajes, ni recuerdos, ni datos de salud) y es de solo lectura salvo la fila de auditoría.
 *
 * Gestión del panel (migración 047): `lib/admin/administradores.ts` (alta/baja de administradores, solo dueños de ADMIN_EMAILS),
 * `lib/admin/suspensiones.ts` (Auth Admin API `updateUserById` con `ban_duration` + RPC `admin_suspender_usuario` /
 * `admin_reactivar_usuario`; nunca a un dueño ni a un administrador), `lib/admin/envios-masivos.ts` (crear/cancelar un envío
 * masivo) y `lib/notificaciones/masivos.ts` (el cron `dosis-vencidas`, detrás de `x-cron-secret`, procesa el envío por lotes).
 * `lib/admin/acceso.ts` también consulta `admin_es_administrador` con este cliente, pero solo DESPUÉS de `getUser()` y para
 * quien no es dueño. Todo recibe el `Admin` de `requireAdmin()` como prueba previa y queda en `admin_acciones`.
 *
 * Escritores de contabilidad de SISTEMA (tablas con RLS sin policies, a propósito, para que ni el
 * dueño las lea ni las reescriba): `registrarUsoIA` (`uso_ia_diario`), `registrarRespuestaChat`
 * (`lib/chat/registros.ts`, `registros_chat`: una fila por respuesta de vita con latencia, tokens,
 * nombres de tools y versión del prompt, SIN texto ni datos de salud; la agenda `after()` de
 * `/api/chat`) y `verificarLimitePedidos` (`lib/limites/nucleo.ts`, `limites_pedidos` vía la RPC
 * `contar_pedido`: tope de pedidos por usuario / por IP hasheada con HMAC a `/api/chat` y `/api/voz/*`). Todos se llaman DESPUÉS de que la
 * sesión autenticó al usuario: el `usuario_id` sale de esa sesión, nunca del cliente. La retención de
 * `registros_chat` (90 días), de `limites_pedidos` (2 días) y de `web_vitals` (30 días) la hace el cron `dosis-vencidas` (`lib/notificaciones/retencion.ts`).
 *
 * Telemetría ANÓNIMA de velocidad real (`POST /api/vitals`, `web_vitals`, migración 050): la mandan también pantallas sin
 * sesión (/login), así que no hay usuario que autenticar; por eso la route valida el payload con zod (tamaño y forma), le saca
 * ids y query a la ruta, frena por IP hasheada con HMAC (`contar_pedido`, la IP nunca se guarda) y solo hace `insert` en una
 * tabla sin policies. No guarda usuario, IP ni user agent (solo se usa para decidir mobile / desktop). Retención de 30 días en
 * el cron `dosis-vencidas`. Se lee únicamente con `admin_web_vitals` desde el panel, tras `requireAdmin()`.
 *
 * TEST-ONLY (token fijo de dispositivo; `lib/supabase/dispositivo.ts`): un ESP32 sin navegador llama a `/api/chat` y `/api/voz/*` con
 * `Authorization: Bearer <DISPOSITIVO_TOKEN>` como UN usuario fijo (`DISPOSITIVO_USUARIO_ID`). Solo si el token coincide (sha256 +
 * `timingSafeEqual`) se acuña una sesión de ese usuario (getUserById + generateLink + verifyOtp) y se cachea en memoria; luego todo
 * corre con RLS como ese usuario. Atajo de pruebas a reemplazar por tokens por dispositivo (diseño de la migración 048).
 *
 * Invitación de cuidador por código (`lib/invitaciones/nucleo.ts`, migración 054): quien abre `/c/<código>` no tiene sesión.
 * Con freno por IP lee la invitación (solo primeros nombres y permiso), guarda y verifica el código que va a la casilla invitada
 * y, recién si acertó, crea la cuenta de ese mail o abre su sesión (equivale a "olvidé mi contraseña"). Aceptar va con el cliente
 * de SESIÓN (la RPC revalida el mail) y el aviso a quien invitó se manda después de eso.
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
