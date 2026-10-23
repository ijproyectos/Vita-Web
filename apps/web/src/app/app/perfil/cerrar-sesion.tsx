"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { VitaIcon } from "@/lib/vita-icons";
import { Tile } from "./filas";

// Fila "Cerrar sesión" + hoja de confirmación (V7 CERRAR SESIÓN): antes de
// salir avisa que, sin sesión, el celular deja de recibir los avisos de
// remedios. "Cerrar sesión" envía el POST a /auth/signout de siempre.
export function CerrarSesion({ sub }: { sub: string }) {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left [&:not(:first-child)]:border-t [&:not(:first-child)]:border-foreground/[0.06]"
      >
        <Tile icon="logout" />
        <div className="min-w-0 flex-1">
          <div className="font-heading text-[14.5px] font-extrabold tracking-[-0.02em]">Cerrar sesión</div>
          <div className="mt-0.5 text-[11.5px] font-medium leading-snug text-subtle">{sub}</div>
        </div>
        <VitaIcon name="chevron-right" size={18} className="shrink-0 text-faint" />
      </button>

      <Sheet open={abierto} onOpenChange={setAbierto}>
        <SheetContent side="bottom" showCloseButton={false} className="gap-3.5 rounded-t-[28px] bg-card px-5 pb-[34px] pt-6">
          <div>
            <SheetTitle className="font-heading text-xl font-extrabold tracking-[-0.02em]">¿Cerrar sesión?</SheetTitle>
            <SheetDescription className="mt-1.5 text-pretty text-[13.5px] font-medium leading-[1.45] text-slate-brand">
              Tus datos quedan guardados. Pero hasta que vuelvas a entrar, en este celular no te llegan los avisos de remedios.
            </SheetDescription>
          </div>
          <button
            type="button"
            onClick={() => setAbierto(false)}
            className="rounded-full bg-primary py-[15px] text-[14.5px] font-extrabold text-primary-foreground shadow-cta"
          >
            Seguir en vita
          </button>
          <form action="/auth/signout" method="post">
            <button type="submit" className="w-full rounded-full py-3 text-sm font-extrabold text-destructive">
              Cerrar sesión
            </button>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}
