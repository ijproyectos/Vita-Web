import { redirect } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { PantallaInicio } from "./pantalla";

// La bienvenida vive ANTES del login (/login, V7 "Bienvenida"), así que acá
// ya no hay intro: quien llega sin código sigue al "¿Cómo vas a usar Vita?".
// Esta ruta queda solo para reclamar un código de vínculo ya logueado/a:
// `?modo=codigo` (link "Tengo Google y un código" de /login) abre la pantalla
// vacía; `?codigo=` (deep link de /onboarding/vincular-cuidado, mail o
// WhatsApp) la trae con el código ya escrito.
export default async function OnboardingInicioPage(props: PageProps<"/onboarding/inicio">) {
  await requireUser();
  const searchParams = await props.searchParams;
  const codigoParam = searchParams?.codigo;
  const codigoInicial = Array.isArray(codigoParam) ? codigoParam[0] : codigoParam;
  const modoParam = searchParams?.modo;
  const modo = Array.isArray(modoParam) ? modoParam[0] : modoParam;

  if (!codigoInicial && modo !== "codigo") redirect("/onboarding/para-quien");

  return <PantallaInicio codigoInicial={codigoInicial?.replace(/\D/g, "").slice(0, 6)} />;
}
