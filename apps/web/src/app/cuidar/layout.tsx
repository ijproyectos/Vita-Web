import { requireUser } from "@/lib/dal";
import { requireNoSuspendida } from "@/lib/suspensiones/guardia";
import { createClient } from "@/lib/supabase/server";
import { listarDosisVencidasDeMisElders, listarElders } from "@/lib/cuidadores/nucleo";
import { RastreadorNavegacion } from "@/lib/navegacion/rastreador";
import { AlertaDosisPopup } from "./alerta-dosis-popup";

// Árbol separado de /app/layout.tsx (que asume que el usuario autenticado
// es dueño de su propia data): acá el usuario autenticado es un cuidador
// mirando datos de OTRA persona. Por eso no monta ChatOverlayProvider, ni
// BottomNav, ni el FAB de vita — ninguno de los tres tiene sentido en un
// modo de solo lectura sobre datos ajenos.
//
// Solo valida sesión (`requireUser`), no `requireCuidador`: la invitación
// (`/cuidar/invitacion/[token]`) la abre alguien que todavía no cuida a nadie.
// `listarElders` va directo (sin redirect) solo para el popup de alerta.
export default async function CuidarLayout({ children }: LayoutProps<"/cuidar">) {
  const usuario = await requireUser();
  await requireNoSuspendida();
  const supabase = await createClient();
  const elders = await listarElders(supabase, usuario.id);
  const dosisVencidas = elders.length > 0 ? await listarDosisVencidasDeMisElders(supabase, elders) : [];

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background pb-6">
      <RastreadorNavegacion />
      <AlertaDosisPopup dosis={dosisVencidas} />
      {children}
    </div>
  );
}
