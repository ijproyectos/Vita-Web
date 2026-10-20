"use client";

import Link from "next/link";
import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AvatarPersona } from "@/components/vita/avatar-persona";
import { VitaIcon } from "@/lib/vita-icons";
import { cn } from "@/lib/utils";
import { cambiarPerfilActivoAction } from "@/app/app/familia/actions";
import type { OpcionPerfil } from "@/lib/familia/tipos";

// Selector de perfiles (V7 "PROFILE SWITCHER"): el chevron del saludo en Home
// y "Rutina de {nombre} ▾" abren este bottom sheet. Elegir a alguien cambia el
// perfil activo (cookie validada en el servidor) y refresca la pantalla.
export function SelectorPerfil({
  opciones,
  activoId,
  children,
  className,
  ariaLabel = "Cambiar de perfil",
}: {
  opciones: OpcionPerfil[];
  activoId: string;
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [pendiente, startTransition] = useTransition();

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
      <button type="button" onClick={() => setAbierto(true)} aria-label={ariaLabel} className={className}>
        {children}
      </button>
      <Sheet open={abierto} onOpenChange={setAbierto}>
        <SheetContent side="bottom" className="rounded-t-[28px] pb-8">
          <SheetHeader>
            <SheetTitle>Perfiles</SheetTitle>
            <SheetDescription>¿De quién querés ver?</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-1 px-4">
            {opciones.map((o) => {
              const activo = o.id === activoId;
              return (
                <button
                  key={o.id}
                  type="button"
                  disabled={pendiente}
                  onClick={() => elegir(o.id)}
                  aria-pressed={activo}
                  className={cn(
                    "flex items-center gap-3 rounded-[var(--radius-item)] p-3 text-left transition-colors disabled:opacity-60",
                    activo ? "bg-secondary" : "hover:bg-secondary/60"
                  )}
                >
                  <AvatarPersona nombre={o.nombre} color={o.color} size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-heading text-[15px] font-extrabold tracking-[-0.02em]">
                      {o.esPropio ? `${o.nombre} (vos)` : o.nombre}
                    </div>
                    <div className="mt-0.5 truncate text-xs font-medium text-subtle">{o.sub}</div>
                  </div>
                  {activo && (
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <VitaIcon name="check" size={14} strokeWidth={3} />
                    </span>
                  )}
                </button>
              );
            })}
            <Link
              href="/app/familia"
              onClick={() => setAbierto(false)}
              className="mt-1 flex items-center gap-3 rounded-[var(--radius-item)] p-3 font-heading text-[14.5px] font-extrabold"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
                <VitaIcon name="user-plus" size={19} />
              </span>
              Agregar a alguien
            </Link>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
