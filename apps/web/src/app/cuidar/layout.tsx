import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { listarDosisVencidasDeMisElders, listarElders } from "@/lib/cuidadores/nucleo";
import { AlertaDosisPopup } from "./alerta-dosis-popup";

// Árbol separado de /app/layout.tsx (que asume que el usuario autenticado
// es dueño de su propia data): acá el usuario autenticado es un cuidador
// mirando datos de OTRA persona. Por eso no monta ChatOverlayProvider, ni
// BottomNav, ni el FAB de vita — ninguno de los tres tiene sentido en un
// modo de solo lectura sobre datos ajenos.
//
// A propósito solo valida sesión acá (`requireUser`), no `requireCuidador`
// (que redirige a `/cuidar/sin-vinculos` si no hay vínculos): esa página
// vive bajo este mismo layout, así que llamar `requireCuidador` acá
// produciría un loop de redirects. Cada página hija (`/cuidar`,
// `/cuidar/[elderId]`) llama `requireCuidador` por su cuenta — acá se
// llama `listarElders` directo (sin el redirect) solo para calcular el
// popup de alerta, que se muestra en todo el árbol `/cuidar/*`.
export default async function CuidarLayout({ children }: LayoutProps<"/cuidar">) {
  const usuario = await requireUser();
  const supabase = await createClient();
  const elders = await listarElders(supabase, usuario.id);
  const dosisVencidas = elders.length > 0 ? await listarDosisVencidasDeMisElders(supabase, elders) : [];

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background pb-6">
      <AlertaDosisPopup dosis={dosisVencidas} />
      {children}
    </div>
  );
}
