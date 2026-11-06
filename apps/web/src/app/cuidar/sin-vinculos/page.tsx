import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { VitaIcon } from "@/lib/vita-icons";
import { FormCerrarSesion } from "@/components/vita/form-cerrar-sesion";

// Destino de `requireCuidador()` cuando el usuario autenticado no tiene
// ningún vínculo `aceptado` como cuidador — solo `requireUser()` acá
// (nunca `requireCuidador()`, que redirigiría de vuelta a esta misma
// página). Tiene salidas: volver a su vita, vincularse con un código o
// cerrar sesión, para no ser un callejón sin salida.
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
      <div className="mt-3 flex w-full max-w-[280px] flex-col gap-2">
        <Link
          href="/app"
          className="flex h-12 items-center justify-center rounded-full bg-primary text-[15px] font-extrabold text-primary-foreground"
        >
          Ir a mi vita
        </Link>
        <Link
          href="/onboarding/vincular-cuidado"
          className="flex h-12 items-center justify-center gap-2 rounded-full bg-card text-[15px] font-extrabold text-teal-deep shadow-item"
        >
          <VitaIcon name="link" size={16} />
          Vincular con un código
        </Link>
        <FormCerrarSesion className="flex justify-center pt-2">
          <button type="submit" className="text-sm font-semibold text-destructive">
            Cerrar sesión
          </button>
        </FormCerrarSesion>
      </div>
    </div>
  );
}
