import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import * as chat from "@/lib/chat/nucleo";
import { ChatView } from "./chat-view";

export default async function ChatPage(props: PageProps<"/app/chat">) {
  const usuario = await requireUser();
  const supabase = await createClient();
  const searchParams = await props.searchParams;
  const sesionParam = searchParams?.sesion;
  const sesionId = Array.isArray(sesionParam) ? sesionParam[0] : sesionParam ?? null;

  const [sesiones, mensajesIniciales] = await Promise.all([
    chat.listarSesiones(supabase, usuario.id),
    sesionId ? chat.listarMensajes(supabase, usuario.id, sesionId) : Promise.resolve([]),
  ]);

  return (
    // key por sesión: entrar a un chat distinto desde el drawer tiene que
    // resetear el estado local de <ChatView> (mensajes, input) — sin esto,
    // React reutiliza la misma instancia y el useState de mensajes queda
    // pisado con la conversación anterior. Mismo criterio que
    // key={planActivo?.id} en NutrIA.
    <ChatView
      key={sesionId ?? "nuevo"}
      sesionId={sesionId}
      mensajesIniciales={mensajesIniciales}
      sesiones={sesiones}
    />
  );
}
