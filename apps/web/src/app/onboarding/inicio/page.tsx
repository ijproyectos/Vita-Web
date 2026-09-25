import { requireUser } from "@/lib/dal";
import { PantallaInicio } from "./pantalla";

// Primer paso real de onboarding (ver app/app/layout.tsx, que redirige
// acá en vez de a /onboarding/nombre) — separa a quien ya tiene un código
// de vínculo (un elder cuyo cuidador generó el código desde
// /onboarding/vincular-cuidado) del resto, que sigue el guion normal
// empezando por /onboarding/para-quien. `?modo=codigo` (nuevo — desde el
// link "Me invitó un familiar, tengo un código" de /login) abre la misma
// sub-vista de código, sin pre-cargar nada (a diferencia de `?codigo=`, el
// deep link del QR, que sí trae el código ya escrito).
export default async function OnboardingInicioPage(props: PageProps<"/onboarding/inicio">) {
  await requireUser();
  const searchParams = await props.searchParams;
  const codigoParam = searchParams?.codigo;
  const codigoInicial = Array.isArray(codigoParam) ? codigoParam[0] : codigoParam;
  const modoParam = searchParams?.modo;
  const modo = Array.isArray(modoParam) ? modoParam[0] : modoParam;

  return <PantallaInicio codigoInicial={codigoInicial} abrirCodigoInicial={modo === "codigo"} />;
}
