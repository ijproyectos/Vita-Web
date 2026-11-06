import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { obtenerPerfil } from "./nucleo";

async function leer(usuarioId: string) {
  return obtenerPerfil(await createClient(), usuarioId);
}

/**
 * Perfil leido con el cliente de SESION, una sola vez por request y por id: el
 * layout y la pagina que lo piden en la misma navegacion comparten la lectura.
 * Solo para render (Server Components). Las Server Actions y las tools de chat
 * siguen usando `obtenerPerfil(supabase, id)` del nucleo, que siempre lee fresco
 * (despues de una escritura no se debe servir una copia anterior).
 */
export const obtenerPerfilCacheado = cache(leer);
