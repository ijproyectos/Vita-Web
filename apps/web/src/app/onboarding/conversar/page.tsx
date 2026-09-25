import { redirect } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import * as perfilNucleo from "@/lib/perfil/nucleo";
import { ConversarOnboarding } from "./conversar";

// Entrada del onboarding conversacional nuevo — alcanzada desde
// guardarUsoAppAction (../actions.ts) una vez que `uso_app` ya está
// guardado. Si alguien llega acá directo sin haber pasado por
// /onboarding/para-quien (uso_app todavía null), se lo manda para allá en
// vez de asumir un valor.
export default async function OnboardingConversarPage() {
  const usuario = await requireUser();
  const supabase = await createClient();
  const perfil = await perfilNucleo.obtenerPerfil(supabase, usuario.id);

  if (!perfil?.uso_app) {
    redirect("/onboarding/para-quien");
  }

  return <ConversarOnboarding usoApp={perfil.uso_app} />;
}
