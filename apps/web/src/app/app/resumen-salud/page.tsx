import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import * as perfilNucleo from "@/lib/perfil/nucleo";
import { TopBar } from "../top-bar";
import { ResumenSaludView } from "./resumen-salud-view";

export default async function ResumenSaludPage() {
  const usuario = await requireUser();
  const supabase = await createClient();
  const perfil = await perfilNucleo.obtenerPerfil(supabase, usuario.id);

  if (!perfil) return null; // requireUser ya garantiza sesión; perfiles se crea en el callback de auth

  return (
    <div className="flex flex-col gap-4.5 px-4 pt-2">
      <TopBar eyebrow="Perfil" title="Resumen de salud" />
      <ResumenSaludView perfil={perfil} email={usuario.email ?? ""} />
    </div>
  );
}
