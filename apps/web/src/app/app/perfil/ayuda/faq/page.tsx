import { requireUser } from "@/lib/dal";
import { TopBar } from "@/app/app/top-bar";
import { PreguntasFrecuentes } from "./preguntas";

export default async function FaqPage() {
  await requireUser();

  return (
    <div className="flex flex-col gap-5 px-[18px] pb-10 pt-1.5">
      <TopBar volverA="/app/perfil/ayuda" eyebrow="Ayuda" title="Preguntas frecuentes" />
      <PreguntasFrecuentes />
    </div>
  );
}
