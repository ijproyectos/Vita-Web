import { requireUser } from "@/lib/dal";
import { VitaIcon } from "@/lib/vita-icons";

// Destino de `requireCuidador()` cuando el usuario autenticado no tiene
// ningún vínculo `aceptado` como cuidador — solo `requireUser()` acá
// (nunca `requireCuidador()`, que redirigiría de vuelta a esta misma
// página).
export default async function SinVinculosPage() {
  await requireUser();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-7 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-secondary text-muted-foreground">
        <VitaIcon name="users" size={26} />
      </div>
      <div className="font-heading text-[18px] font-bold">Todavía no cuidás a nadie</div>
      <p className="max-w-[280px] text-sm text-muted-foreground">
        Cuando alguien te invite como cuidador y aceptes el link que te comparta, vas a ver su adherencia
        a los medicamentos acá.
      </p>
    </div>
  );
}
