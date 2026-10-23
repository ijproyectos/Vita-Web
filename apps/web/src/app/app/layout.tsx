import { redirect } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import * as perfilNucleo from "@/lib/perfil/nucleo";
import { ChatOverlayProvider } from "@/lib/chat/overlay-context";
import { obtenerOpcionesPerfil, obtenerPerfilActivo } from "@/lib/familia/perfil-activo";
import { BarraSinConexion } from "@/components/vita/barra-sin-conexion";
import { BloqueoPin } from "@/components/vita/bloqueo-pin";
import { RastreadorNavegacion } from "@/lib/navegacion/rastreador";
import { BottomNav } from "./bottom-nav";
import { VitaChatOverlay } from "./_chat/vita-chat-overlay";

export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const usuario = await requireUser();
  const supabase = await createClient();
  const perfil = await perfilNucleo.obtenerPerfil(supabase, usuario.id);

  // Onboarding (nombre + encuesta scripteada) se muestra una sola vez —
  // gatea toda /app/* acá, en el punto de entrada compartido.
  if (!perfil?.onboarding_completado_at) {
    redirect("/onboarding/para-quien");
  }

  // Para la pulsación larga de "Perfil" (abre el selector de perfiles): solo
  // tiene sentido si hay a quién cambiar.
  const [activo, opciones] = await Promise.all([obtenerPerfilActivo(), obtenerOpcionesPerfil()]);

  return (
    <ChatOverlayProvider>
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background pb-[140px]">
        <RastreadorNavegacion />
        <BarraSinConexion />
        {children}
      </div>
      <BottomNav opciones={opciones.length > 1 ? opciones : null} activoId={activo.id} />
      <VitaChatOverlay esPropio={activo.esPropio} />
      <BloqueoPin uid={usuario.id} nombre={perfil.nombre?.trim().split(/\s+/)[0] || "vita"} />
    </ChatOverlayProvider>
  );
}
