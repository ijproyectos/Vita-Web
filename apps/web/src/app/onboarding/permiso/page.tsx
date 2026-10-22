import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import * as perfilNucleo from "@/lib/perfil/nucleo";
import { PantallaPermiso } from "./pantalla";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Último paso del onboarding (V7 `isPerm`): se llega al terminar (o "Terminar
// después") el chat. El destino se calcula acá, nunca desde un parámetro
// libre: `?pp=<uuid>` (perfil en borrador de la persona que se cuida) o
// uso_app cuido/ambos -> vincular-cuidado; si no, /app.
export default async function OnboardingPermisoPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const usuario = await requireUser();
  const supabase = await createClient();
  const perfil = await perfilNucleo.obtenerPerfil(supabase, usuario.id).catch(() => null);
  const searchParams = await props.searchParams;
  const ppParam = searchParams?.pp;
  const pp = Array.isArray(ppParam) ? ppParam[0] : ppParam;

  const cuida = perfil?.uso_app === "cuido" || perfil?.uso_app === "ambos";
  const destino =
    pp && UUID.test(pp)
      ? `/onboarding/vincular-cuidado?perfilPendienteId=${pp}`
      : cuida
        ? "/onboarding/vincular-cuidado"
        : "/app";

  return <PantallaPermiso destino={destino} cuida={cuida} />;
}
