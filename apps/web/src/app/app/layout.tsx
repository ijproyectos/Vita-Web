import { redirect } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { requireNoSuspendida } from "@/lib/suspensiones/guardia";
import { obtenerPerfilCacheado } from "@/lib/perfil/cacheado";
import { ChatOverlayProvider } from "@/lib/chat/overlay-context";
import { esVistaSoloMirar } from "@/lib/familia/solo-mirar";
import { obtenerOpcionesPerfil, obtenerPerfilActivo } from "@/lib/familia/perfil-activo";
import { BarraSinConexion } from "@/components/vita/barra-sin-conexion";
import { BloqueoPin } from "@/components/vita/bloqueo-pin";
import { RastreadorNavegacion } from "@/lib/navegacion/rastreador";
import { BottomNav } from "./bottom-nav";
import { GuardiaSoloMirar } from "./guardia-solo-mirar";
import { VitaChatOverlayLazy } from "./_chat/vita-chat-overlay-lazy";

export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const usuario = await requireUser();
  // Cuenta suspendida (mal uso / falta de pago): no ve la app, ve /suspendida. Una consulta indexada por request.
  await requireNoSuspendida();
  const perfil = await obtenerPerfilCacheado(usuario.id);

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
        <GuardiaSoloMirar activa={esVistaSoloMirar(activo)} />
        <BarraSinConexion />
        {children}
      </div>
      <BottomNav opciones={opciones.length > 1 ? opciones : null} activoId={activo.id} oculto={esVistaSoloMirar(activo)} />
      <VitaChatOverlayLazy esPropio={activo.esPropio} nombreActivo={activo.nombre} perfilActivoId={activo.id} />
      <BloqueoPin uid={usuario.id} nombre={perfil.nombre?.trim().split(/\s+/)[0] || "vita"} />
    </ChatOverlayProvider>
  );
}
