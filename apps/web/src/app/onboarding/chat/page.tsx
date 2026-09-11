import { requireUser } from "@/lib/dal";
import { EncuestaOnboarding } from "./encuesta";

export default async function OnboardingChatPage() {
  await requireUser();
  return <EncuestaOnboarding />;
}
