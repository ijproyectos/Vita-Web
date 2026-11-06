import { requireUser } from "@/lib/dal";
import { obtenerPerfilCacheado } from "@/lib/perfil/cacheado";
import { OfertaTuSalud } from "./oferta";

// "¿Querés llevar tu salud en vita?": a donde va un Lector cuando el perfil de la persona que mira no llega
// (antes la página quedaba en blanco y, sin barra inferior, no había salida). Ofrece armar el perfil propio.
export default async function TuSaludPage() {
  const usuario = await requireUser();
  const propio = await obtenerPerfilCacheado(usuario.id).catch(() => null);
  return <OfertaTuSalud nombre={propio?.nombre ?? null} />;
}
