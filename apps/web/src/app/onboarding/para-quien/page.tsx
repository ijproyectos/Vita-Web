import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import * as perfilNucleo from "@/lib/perfil/nucleo";
import { nombreConMayuscula } from "@/lib/perfil/formato";
import { FormularioParaQuien } from "./formulario";

export default async function OnboardingParaQuienPage() {
  const usuario = await requireUser();
  const supabase = await createClient();
  const perfil = await perfilNucleo.obtenerPerfil(supabase, usuario.id).catch(() => null);
  const primerNombre = perfil?.nombre ? nombreConMayuscula(perfil.nombre).split(" ")[0] : null;
  return <FormularioParaQuien nombre={primerNombre} />;
}
