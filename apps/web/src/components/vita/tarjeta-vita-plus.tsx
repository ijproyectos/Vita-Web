import Link from "next/link";
import { VitaIcon } from "@/lib/vita-icons";
import { VMark } from "./v-mark";

// Tarjeta "Probá vita+" de Perfil (V7, variante clara). vita+ todavía no está
// disponible: lleva a la página informativa, sin suscripción ni cobro.
export function TarjetaVitaPlus() {
  return (
    <Link
      href="/app/vita-plus"
      className="relative flex w-full items-center gap-3.5 overflow-hidden rounded-[22px] border-2 border-primary bg-card p-4 text-left shadow-[0_0_0_5px_color-mix(in_srgb,var(--primary)_8%,transparent),var(--elevation-card)] transition-transform active:scale-[0.99] motion-reduce:transition-none"
    >
      <span aria-hidden className="absolute -right-10 -top-[50px] size-[150px] rounded-full bg-primary/[0.08]" />
      <span aria-hidden className="absolute -bottom-[30px] right-[30px] size-[60px] rounded-full bg-amber/[0.16]" />
      <VMark size={48} className="relative shrink-0" />
      <span className="relative min-w-0 flex-1">
        <span className="block font-heading text-lg font-extrabold tracking-[-0.02em]">
          Probá vita<span className="text-aviso">+</span>
        </span>
        <span className="mt-[3px] block text-pretty text-[12.5px] font-medium leading-[1.4] text-slate-brand">
          Más herramientas para cuidar a tu familia.
        </span>
      </span>
      <span className="relative flex size-[34px] shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <VitaIcon name="chevron-right" size={16} strokeWidth={2.4} />
      </span>
    </Link>
  );
}
