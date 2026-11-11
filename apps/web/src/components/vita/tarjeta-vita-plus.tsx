import Link from "next/link";
import { VitaIcon } from "@/lib/vita-icons";
import { createClient } from "@/lib/supabase/server";
import { obtenerEstadoVitaPlus } from "@/lib/vita-plus/nucleo";
import { fechaLarga } from "@/lib/vita-plus/planes";
import { VMark } from "./v-mark";

// Tarjeta de vita+ en Perfil y Familia (V7, variante clara). Sin suscripción invita a probarlo; con vita+
// vigente muestra "Sos vita+ · hasta <fecha>". Ambas llevan a la pantalla de vita+ (donde se cancela).
// En Familia (`familia`) es la del diseño: "Sumar cuidadores es parte de vita+", solo sin vita+ (sin la
// "prueba gratis de 7 días" del diseño: no existe). `nombre`: la primera persona a cargo.
export async function TarjetaVitaPlus({ familia = false, nombre }: { familia?: boolean; nombre?: string | null } = {}) {
  const estado = await obtenerEstadoVitaPlus(await createClient());
  if (familia && estado.activo) return null;
  const hasta = estado.activo && !estado.permanente && estado.venceAt ? fechaLarga(estado.venceAt) : null;
  return (
    <Link
      href="/app/vita-plus"
      className="relative flex w-full items-center gap-3.5 overflow-hidden rounded-[22px] border-2 border-primary bg-card p-4 text-left shadow-[0_0_0_5px_color-mix(in_srgb,var(--primary)_8%,transparent),var(--elevation-card)] transition-transform active:scale-[0.99] motion-reduce:transition-none"
    >
      <span aria-hidden className="absolute -right-10 -top-[50px] size-[150px] rounded-full bg-primary/[0.08]" />
      <span aria-hidden className="absolute -bottom-[30px] right-[30px] size-[60px] rounded-full bg-amber/[0.16]" />
      <VMark size={48} className="relative shrink-0" />
      <span className="relative min-w-0 flex-1">
        <span className={familia ? "block font-heading text-[16px] font-extrabold tracking-[-0.02em]" : "block font-heading text-lg font-extrabold tracking-[-0.02em]"}>
          {familia ? "Sumar cuidadores es parte de vita" : estado.activo ? "Sos vita" : "Probá vita"}
          <span className="text-aviso">+</span>
        </span>
        <span className="mt-[3px] block text-pretty text-[12.5px] font-medium leading-[1.4] text-slate-brand">
          {familia
            ? nombre
              ? `Cuidá a ${nombre} con tu familia.`
              : "Cuidá a los tuyos con tu familia."
            : estado.activo
            ? estado.permanente
              ? "Sin vencimiento."
              : `${hasta ? `Hasta ${hasta} · ` : ""}${estado.renueva ? "se renueva solo" : "no se renueva"}. Tocá para administrarla.`
            : "Más herramientas para cuidar a tu familia."}
        </span>
      </span>
      <span className="relative flex size-[34px] shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <VitaIcon name="chevron-right" size={16} strokeWidth={2.4} />
      </span>
    </Link>
  );
}
