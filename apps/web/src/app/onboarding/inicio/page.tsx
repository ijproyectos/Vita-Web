import { requireUser } from "@/lib/dal";
import { PantallaInicio } from "./pantalla";

// Primer paso real de onboarding (ver app/app/layout.tsx, que redirige
// acá en vez de a /onboarding/nombre) — separa a quien ya tiene un código
// de vínculo (un elder cuyo cuidador generó el código desde
// /onboarding/vincular-cuidado) del resto, que sigue el guion normal
// empezando por /onboarding/para-quien.
export default async function OnboardingInicioPage(props: PageProps<"/onboarding/inicio">) {
  await requireUser();
  const searchParams = await props.searchParams;
  const codigoParam = searchParams?.codigo;
  const codigoInicial = Array.isArray(codigoParam) ? codigoParam[0] : codigoParam;

  return <PantallaInicio codigoInicial={codigoInicial} />;
}
