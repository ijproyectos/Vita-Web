import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import * as perfilNucleo from "@/lib/perfil/nucleo";
import { EncuestaOnboarding } from "./encuesta";

export default async function OnboardingChatPage() {
  const usuario = await requireUser();
  // Este formulario alternativo es alcanzable desde la charla: si la edad ya
  // quedó guardada ahí, no se pregunta de nuevo.
  const perfil = await perfilNucleo.obtenerPerfil(await createClient(), usuario.id).catch(() => null);
  return <EncuestaOnboarding edadConocida={Boolean(perfil?.fecha_nacimiento || perfil?.edad_rango)} />;
}
