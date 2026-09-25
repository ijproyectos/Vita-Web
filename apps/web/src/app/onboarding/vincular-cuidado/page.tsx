import { requireUser } from "@/lib/dal";
import { PantallaVincularCuidado } from "./pantalla";

// Paso 5 del onboarding (solo para uso_app "cuido"/"ambos", ver
// redirigirSegunUsoApp en ../actions.ts) — Y reentrable fuera del
// onboarding, desde "+ Vincular a alguien" en /app/perfil (ver
// app/app/perfil/page.tsx). No asume estar a mitad de un flujo de
// onboarding: no lee ni escribe nada de onboarding_completado_at.
export default async function OnboardingVincularCuidadoPage() {
  await requireUser();
  return <PantallaVincularCuidado />;
}
