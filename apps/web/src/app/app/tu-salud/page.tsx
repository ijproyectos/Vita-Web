import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import * as perfilNucleo from "@/lib/perfil/nucleo";
import { OfertaTuSalud } from "./oferta";

// "¿Querés llevar tu salud en vita?": a donde va un Lector cuando el perfil de la persona que mira no llega
// (antes la página quedaba en blanco y, sin barra inferior, no había salida). Ofrece armar el perfil propio.
export default async function TuSaludPage() {
  const usuario = await requireUser();
  const supabase = await createClient();
  const propio = await perfilNucleo.obtenerPerfil(supabase, usuario.id).catch(() => null);
  return <OfertaTuSalud nombre={propio?.nombre ?? null} />;
}
