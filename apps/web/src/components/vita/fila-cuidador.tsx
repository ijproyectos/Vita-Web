import Link from "next/link";
import { cn } from "@/lib/utils";
import { VitaIcon } from "@/lib/vita-icons";
import type { CuidadorDePersona } from "@/lib/familia/tipos";
import { colorPorDefecto } from "@/lib/familia/colores";
import { AvatarPersona } from "./avatar-persona";

// Fila de la lista "Cuidadores" / "Quién la cuida" de V7 (Familia).
// "(vos)" lleva el avatar en tinta, el resto en un color de persona.
export function FilaCuidador({
  cuidador,
  indice,
  href,
  personaNombre,
  primera,
}: {
  cuidador: CuidadorDePersona;
  indice: number;
  /** Destino al tocar (se omite en la fila propia). */
  href?: string;
  personaNombre: string;
  primera: boolean;
}) {
  const pendiente = cuidador.estado === "pendiente";
  const sub = pendiente
    ? ["Invitación enviada", cuidador.relacion].filter(Boolean).join(" · ")
    : (cuidador.relacion ?? (cuidador.esYo ? `Cuidás a ${personaNombre}` : "Te cuida"));
  const cuerpo = (
    <>
      {cuidador.esYo ? (
        <span
          aria-hidden
          className="flex size-[42px] shrink-0 items-center justify-center rounded-full bg-ink font-heading text-[17px] font-extrabold text-background"
        >
          {(cuidador.nombre.trim().charAt(0) || "?").toUpperCase()}
        </span>
      ) : (
        <AvatarPersona nombre={cuidador.nombre} color={colorPorDefecto(indice)} size={42} />
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate font-heading text-[14.5px] font-extrabold tracking-[-0.02em]">
          {cuidador.esYo ? `${cuidador.nombre} (vos)` : cuidador.nombre}
        </div>
        <div className="mt-0.5 truncate text-[11.5px] font-medium text-subtle">{sub}</div>
      </div>
      <span
        className={cn(
          "shrink-0 rounded-full px-2.5 py-[5px] text-[11.5px] font-extrabold",
          cuidador.rol === "editar" ? "bg-chip-teal-bg text-chip-teal-ink" : "bg-secondary text-slate-brand"
        )}
      >
        {cuidador.rol === "editar" ? "Admin" : "Lector"}
      </span>
      {href && <VitaIcon name="chevron-right" size={17} className="shrink-0 text-faint" />}
    </>
  );
  const clases = cn("flex items-center gap-[13px] px-4 py-3.5", !primera && "border-t border-foreground/[0.06]");
  return href ? (
    <Link href={href} className={cn(clases, "transition-colors hover:bg-foreground/[0.02]")}>
      {cuerpo}
    </Link>
  ) : (
    <div className={clases}>{cuerpo}</div>
  );
}
