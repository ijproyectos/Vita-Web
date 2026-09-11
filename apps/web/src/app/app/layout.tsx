import { redirect } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import * as perfilNucleo from "@/lib/perfil/nucleo";
import { ChatOverlayProvider } from "@/lib/chat/overlay-context";
import { BottomNav } from "./bottom-nav";
import { VitaChatOverlay } from "./_chat/vita-chat-overlay";

export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const usuario = await requireUser();
  const supabase = await createClient();
  const perfil = await perfilNucleo.obtenerPerfil(supabase, usuario.id);

  // Onboarding (nombre + encuesta scripteada) se muestra una sola vez —
  // gatea toda /app/* acá, en el punto de entrada compartido.
  if (!perfil?.onboarding_completado_at) {
    redirect("/onboarding/nombre");
  }

  return (
    <ChatOverlayProvider>
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background pb-[140px]">
        {children}
      </div>
      <BottomNav />
      <VitaChatOverlay />
    </ChatOverlayProvider>
  );
}
