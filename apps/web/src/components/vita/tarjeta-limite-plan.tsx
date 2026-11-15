import Link from "next/link";
import { VitaIcon } from "@/lib/vita-icons";
import { RUTA_VITA_PLUS } from "@/lib/plan-gratis/logica";

// Tarjeta tranquila para cuando se alcanza un límite del plan gratis: dice qué pasó y qué se puede hacer con
// vita+, y lleva a /app/vita-plus. Reemplaza a la acción (no oculta la función). Sin estado: sirve en servidor y cliente.
export function TarjetaLimitePlan({ titulo, texto, cta = "Conocer vita+" }: { titulo: string; texto: string; cta?: string }) {
  return (
    <div className="flex flex-col gap-3 rounded-[22px] border-2 border-primary bg-card p-4 shadow-card" role="status">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <VitaIcon name="sparkle" size={18} strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-heading text-[15.5px] font-extrabold tracking-[-0.02em]">{titulo}</p>
          <p className="mt-1 text-pretty text-[13px] font-medium leading-[1.45] text-slate-brand">{texto}</p>
        </div>
      </div>
      <Link
        href={RUTA_VITA_PLUS}
        className="rounded-full bg-primary py-3 text-center font-heading text-[14px] font-extrabold text-primary-foreground shadow-cta transition-transform active:scale-[0.98] motion-reduce:transition-none"
      >
        {cta}
      </Link>
    </div>
  );
}

/** Línea chica con lo que queda del cupo (plan gratis). */
export function LineaCupoPlan({ texto }: { texto: string | null }) {
  if (!texto) return null;
  return <p className="px-1 text-center text-[12.5px] font-semibold text-subtle">{texto}</p>;
}
