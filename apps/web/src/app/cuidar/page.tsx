import Link from "next/link";
import { requireCuidador } from "@/lib/dal";
import { VitaIcon } from "@/lib/vita-icons";
import { VitaWordmark } from "@/components/vita/v-mark";

// Selector de elder — si el cuidador solo tiene un vínculo aceptado, lo
// muestra igual como una única tarjeta (en vez de saltar directo a
// `/cuidar/[elderId]`) para que la navegación sea siempre predecible.
export default async function CuidarPage() {
  const { elders } = await requireCuidador();

  return (
    <div className="flex flex-col gap-5 px-4 pt-6">
      <div className="flex flex-col items-center gap-2 pb-2 text-center">
        <VitaWordmark size={22} />
        <div className="font-heading text-[13px] font-semibold uppercase tracking-wide text-primary">
          Modo cuidador
        </div>
      </div>

      <div>
        <div className="px-1.5 pb-2.5 font-heading text-[15px] font-bold">A quién cuidás</div>
        <div className="flex flex-col gap-2.5">
          {elders.map((elder) => (
            <Link
              key={elder.elderId}
              href={`/cuidar/${elder.elderId}`}
              className="flex items-center gap-3 rounded-[20px] bg-card p-4 shadow-[var(--shadow-card,0_8px_24px_rgba(15,33,54,0.06))]"
            >
              <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary font-heading text-base font-extrabold text-primary">
                {elder.nombre.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-heading text-[15px] font-bold">{elder.nombre}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">Ver adherencia de hoy</div>
              </div>
              <VitaIcon name="chevron-right" size={16} className="text-muted-foreground" />
            </Link>
          ))}
        </div>
      </div>

      <form action="/auth/signout" method="post" className="flex justify-center py-4">
        <button type="submit" className="text-sm font-semibold text-destructive">
          Cerrar sesión
        </button>
      </form>
    </div>
  );
}
