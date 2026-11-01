import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import * as perfilNucleo from "@/lib/perfil/nucleo";
import { vitaPlusConfigurado } from "@/lib/vita-plus/mercadopago";
import { obtenerEstadoVitaPlus } from "@/lib/vita-plus/nucleo";
import { PantallaVitaPlus } from "./pantalla";

// vita+: suscripción con Mercado Pago (ver lib/vita-plus). Sin credenciales (MP_ACCESS_TOKEN) la pantalla sigue
// mostrando "Muy pronto" deshabilitado, así el deploy no se rompe antes de tenerlas.
export default async function VitaPlusPage() {
  const usuario = await requireUser();
  const supabase = await createClient();
  const [perfil, estado] = await Promise.all([
    perfilNucleo.obtenerPerfil(supabase, usuario.id).catch(() => null),
    obtenerEstadoVitaPlus(supabase),
  ]);
  const inicial = (perfil?.nombre?.trim() || usuario.email || "V").charAt(0).toUpperCase();
  return <PantallaVitaPlus inicial={inicial} habilitado={vitaPlusConfigurado()} estado={estado} />;
}
