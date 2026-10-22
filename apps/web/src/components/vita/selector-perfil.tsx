"use client";

import Link from "next/link";
import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AvatarPersona } from "@/components/vita/avatar-persona";
import { VitaIcon } from "@/lib/vita-icons";
import { cn } from "@/lib/utils";
import { CLASES_COLOR } from "@/lib/familia/colores";
import { cambiarPerfilActivoAction } from "@/app/app/familia/actions";
import type { OpcionPerfil } from "@/lib/familia/tipos";

// Selector de perfiles (V7 "PROFILE SWITCHER"): el nombre con chevron de Home,
// Rutina, Mi Salud y Perfil —y la pulsación larga de "Perfil" en el bottom
// nav— abren este bottom sheet. Elegir a alguien cambia el perfil activo
// (cookie validada en el servidor) y refresca la pantalla.
export function SelectorPerfil({
  opciones,
  activoId,
  children,
  className,
  ariaLabel = "Cambiar de perfil",
  abierto: abiertoControlado,
  onAbiertoChange,
}: {
  opciones: OpcionPerfil[];
  activoId: string;
  /** Contenido del disparador. Sin `children` el sheet solo se abre desde afuera (modo controlado). */
  children?: ReactNode;
  className?: string;
  ariaLabel?: string;
  abierto?: boolean;
  onAbiertoChange?: (abierto: boolean) => void;
}) {
  const router = useRouter();
  const [abiertoInterno, setAbiertoInterno] = useState(false);
  const [pendiente, startTransition] = useTransition();
  const controlado = abiertoControlado !== undefined;
  const abierto = controlado ? abiertoControlado : abiertoInterno;
  const setAbierto = (v: boolean) => {
    if (!controlado) setAbiertoInterno(v);
    onAbiertoChange?.(v);
  };

  function elegir(id: string) {
    if (id === activoId) {
      setAbierto(false);
      return;
    }
    startTransition(async () => {
      try {
        const r = await cambiarPerfilActivoAction(id);
        if (r.status === "error") {
          toast.error(r.message);
          return;
        }
        setAbierto(false);
        router.refresh();
      } catch {
        toast.error("No pudimos cambiar de perfil.");
      }
    });
  }

  return (
    <>
      {children !== undefined && (
        <button type="button" onClick={() => setAbierto(true)} aria-label={ariaLabel} className={className}>
          {children}
        </button>
      )}
      <Sheet open={abierto} onOpenChange={setAbierto}>
        <SheetContent side="bottom" showCloseButton={false} className="rounded-t-[28px] bg-card px-4 pb-[38px] pt-3.5">
          <div aria-hidden className="mx-auto mb-1 h-1 w-10 rounded bg-line-soft" />
          <SheetHeader className="p-0 px-1">
            <div className="eyebrow text-subtle">Perfiles</div>
            <SheetTitle className="mt-[5px] font-heading text-[21px] font-extrabold tracking-[-0.02em]">
              ¿De quién querés ver?
            </SheetTitle>
            <SheetDescription className="sr-only">Elegí de quién ver la rutina, la salud y los avisos.</SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-[9px]">
            {opciones.map((o) => {
              const activo = o.id === activoId;
              const color = CLASES_COLOR[o.color];
              const { texto, tono } = lineaDeEstado(o);
              return (
                <button
                  key={o.id}
                  type="button"
                  disabled={pendiente}
                  onClick={() => elegir(o.id)}
                  aria-pressed={activo}
                  className={cn(
                    "flex items-center gap-[13px] rounded-[18px] border-2 px-3.5 py-[13px] text-left transition-colors disabled:opacity-60",
                    activo ? `${color.fondo} ${color.borde}` : "border-transparent bg-canvas/60"
                  )}
                >
                  <span className="relative shrink-0">
                    <AvatarPersona nombre={o.nombre} color={o.color} size={46} />
                    {tono === "alerta" && !o.esPropio && (
                      <span aria-hidden className="absolute right-0 top-0 size-3 rounded-full bg-aviso ring-[2.5px] ring-card" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-heading text-[15.5px] font-extrabold tracking-[-0.02em]">{o.nombre}</div>
                    <div className={cn("mt-0.5 truncate text-xs font-semibold", tono === "alerta" ? "text-aviso-ink" : "text-subtle")}>
                      {texto}
                    </div>
                  </div>
                  {activo && (
                    <span className={cn("flex size-[26px] shrink-0 items-center justify-center rounded-full text-primary-foreground", color.solido)}>
                      <VitaIcon name="check" size={14} strokeWidth={3} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {opciones.length < 2 && (
            <Link
              href="/app/familia/nuevo"
              onClick={() => setAbierto(false)}
              className="mt-0.5 flex items-center gap-[13px] rounded-[18px] px-3.5 py-3 font-heading text-[14.5px] font-extrabold hover:bg-canvas/60"
            >
              <span className="flex size-[46px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-dashed border-foreground/20 text-slate-brand">
                <VitaIcon name="plus" size={18} />
              </span>
              Agregar a alguien que cuido
            </Link>
          )}
          <Link
            href="/app/familia"
            onClick={() => setAbierto(false)}
            className="flex items-center gap-[13px] rounded-[18px] px-3.5 py-3 font-heading text-[14.5px] font-extrabold hover:bg-canvas/60"
          >
            <span className="flex size-[46px] shrink-0 items-center justify-center rounded-full bg-canvas/60 text-slate-brand">
              <VitaIcon name="users" size={19} />
            </span>
            Administrar familia
          </Link>
        </SheetContent>
      </Sheet>
    </>
  );
}

// Línea de estado de cada persona (idéntica a la del diseño):
//   vos       -> "Vos · 2 de 5 hoy"
//   otra      -> "Losacor 9:00 sin marcar" (alerta) o "2 de 5 hoy"
// Sin datos de hoy (consulta fallida) cae al texto fijo de la opción.
function lineaDeEstado(o: OpcionPerfil): { texto: string; tono: "normal" | "alerta" } {
  const e = o.estado;
  if (!e) return { texto: o.sub, tono: "normal" };
  if (o.esPropio) return { texto: e.total === 0 ? "Vos · sin medicamentos hoy" : `Vos · ${e.tomadas} de ${e.total} hoy`, tono: "normal" };
  if (e.vencida) return { texto: `${e.vencida.nombre} ${e.vencida.hora} sin marcar`, tono: "alerta" };
  return { texto: e.total === 0 ? "Sin medicamentos hoy" : `${e.tomadas} de ${e.total} hoy`, tono: "normal" };
}
