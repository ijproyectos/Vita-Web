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
 * Fuera de esos dos usos (y de `lib/cuenta/nucleo.ts`, que borra la cuenta
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
