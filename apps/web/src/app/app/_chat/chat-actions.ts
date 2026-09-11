"use server";

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";
import * as chat from "@/lib/chat/nucleo";
import type { MensajeChat, SesionChat } from "@/lib/chat/tipos";

// Server Actions consumidas por el overlay de chat (componente cliente,
// no una página) — reemplazan el fetch en el server component que hacía
// el viejo /app/chat/page.tsx.

export async function listarSesionesAction(): Promise<SesionChat[]> {
  const usuario = await requireUser();
  const supabase = await createClient();
  return chat.listarSesiones(supabase, usuario.id);
}

export async function listarMensajesAction(sesionId: string): Promise<MensajeChat[]> {
  const usuario = await requireUser();
  const supabase = await createClient();
  return chat.listarMensajes(supabase, usuario.id, sesionId);
}

// Ya no redirige (no hay a dónde — el chat es un overlay, no una ruta) —
// el cliente resetea su propio estado local después de llamar a esto.
export async function eliminarHistorialAction(): Promise<void> {
  const usuario = await requireUser();
  const supabase = await createClient();
  await chat.eliminarHistorial(supabase, usuario.id);
}
