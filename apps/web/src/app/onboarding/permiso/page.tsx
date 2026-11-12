import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import * as perfilNucleo from "@/lib/perfil/nucleo";
import { PantallaPermiso } from "./pantalla";
import { DESTINO_CON_TOUR } from "@/lib/tour/pasos";

// Último paso del onboarding (V7 `isPerm`): se llega al terminar (o "Terminar
// después") el chat. Siempre sigue a /app: la charla ya crea a la persona a
// cargo como perfil gestionado real, y su celular se conecta desde su ficha.
export default async function OnboardingPermisoPage() {
  const usuario = await requireUser();
  const supabase = await createClient();
  const perfil = await perfilNucleo.obtenerPerfil(supabase, usuario.id).catch(() => null);

  const cuida = perfil?.uso_app === "cuido" || perfil?.uso_app === "ambos";
  return <PantallaPermiso destino={DESTINO_CON_TOUR} cuida={cuida} />;
}
