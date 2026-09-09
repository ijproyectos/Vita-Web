"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";
import * as chat from "@/lib/chat/nucleo";

// Replica clearHistory() del ChatProvider original — borra todas las
// sesiones del usuario y lo manda a un chat nuevo.
export async function eliminarHistorialAction() {
  const usuario = await requireUser();
  const supabase = await createClient();
  await chat.eliminarHistorial(supabase, usuario.id);
  redirect("/app/chat");
}
