import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import * as perfilNucleo from "@/lib/perfil/nucleo";
import { PantallaVitaPlus } from "./pantalla";

// vita+ (V7): página informativa. Todavía no hay proveedor de cobro ni
// suscripciones, así que nada se contrata, se prueba ni se cobra desde acá.
export default async function VitaPlusPage() {
  const usuario = await requireUser();
  const supabase = await createClient();
  const perfil = await perfilNucleo.obtenerPerfil(supabase, usuario.id).catch(() => null);
  const inicial = (perfil?.nombre?.trim() || usuario.email || "V").charAt(0).toUpperCase();
  return <PantallaVitaPlus inicial={inicial} />;
}
