import { requireUser } from "@/lib/dal";
import { PantallaVincularCuidado } from "./pantalla";

// Paso final del onboarding conversacional nuevo (solo para uso_app
// "cuido"/"ambos", ver /onboarding/conversar/conversar.tsx) — Y reentrable
// fuera del onboarding, desde "+ Vincular a alguien" en /app/perfil (ver
// app/app/perfil/page.tsx). No asume estar a mitad de un flujo de
// onboarding: no lee ni escribe nada de onboarding_completado_at.
// `?perfilPendienteId=` (opcional) llega desde /onboarding/conversar para
// linkear el código generado al perfil en borrador recién armado — "+
// Vincular a alguien" no lo manda, comportamiento sin cambios.
export default async function OnboardingVincularCuidadoPage(props: PageProps<"/onboarding/vincular-cuidado">) {
  await requireUser();
  const searchParams = await props.searchParams;
  const param = searchParams?.perfilPendienteId;
  const perfilPendienteId = Array.isArray(param) ? param[0] : param;
  return <PantallaVincularCuidado perfilPendienteId={perfilPendienteId} />;
}
