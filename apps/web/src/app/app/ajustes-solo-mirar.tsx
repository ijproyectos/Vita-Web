"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { VitaIcon } from "@/lib/vita-icons";
import { dejarDeCuidarAction } from "./familia/actions";
import { CerrarSesion } from "./perfil/cerrar-sesion";
import { FilaNav, Grupo, Tile } from "./perfil/filas";
import type { alDejarDeCuidar } from "@/lib/familia/solo-mirar";

// Engranaje fijo abajo a la derecha de la vista "solo mirar" (B6) y la hoja
// de ajustes que abre. Alineado a la columna max-w-md, respetando el área
// segura; mismo lenguaje que "Ajustes" del modo simple.
export function AjustesSoloMirar({
  nombre,
  vinculoId,
  alDejar,
  sub,
}: {
  nombre: string;
  vinculoId: string | null;
  alDejar: ReturnType<typeof alDejarDeCuidar>;
  sub: string;
}) {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <div
        className="pointer-events-none fixed inset-x-0 z-30 mx-auto flex w-full max-w-md justify-end px-[18px]"
        style={{ bottom: "var(--safe-bottom)" }}
      >
        <button
          type="button"
          onClick={() => setAbierto(true)}
          aria-label="Ajustes"
          className="pointer-events-auto flex size-[52px] items-center justify-center rounded-full bg-secondary text-slate-brand shadow-nav transition-transform active:scale-[0.95] motion-reduce:transition-none"
        >
          <VitaIcon name="settings" size={24} />
        </button>
      </div>

      <Sheet open={abierto} onOpenChange={setAbierto}>
        <SheetContent side="bottom" className="max-h-[88dvh] overflow-y-auto rounded-t-[28px] pb-8">
          <SheetHeader>
            <SheetTitle>Ajustes</SheetTitle>
            <SheetDescription>Tu cuenta y tus avisos. Lo de {nombre} solo se mira.</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-4 px-4">
            <Grupo>
              <FilaNav icon="bell" label="Avisos" sub="Lo que te avisó vita" href="/app/avisos" />
              <FilaNav icon="clock" label="Recordatorios" sub="Qué avisos recibir, esperas y silencio de noche" href="/app/avisos/configuracion" />
              {vinculoId && <DejarDeCuidar nombre={nombre} vinculoId={vinculoId} alDejar={alDejar} />}
            </Grupo>
            <Grupo>
              <FilaNav icon="shield" label="Seguridad" sub="PIN al volver y tu sesión" href="/app/perfil/seguridad" />
              <FilaNav icon="lock" label="Privacidad y datos" sub="Exportar o borrar tu historial" href="/app/perfil/privacidad" />
              <FilaNav icon="help" label="Ayuda y soporte" sub="Preguntas frecuentes y contacto" href="/app/perfil/ayuda" />
              <FilaNav icon="trash" tono="rose" peligro label="Eliminar mi cuenta" sub="Borra tus datos para siempre" href="/app/perfil/eliminar-cuenta" />
              <CerrarSesion sub={sub} />
            </Grupo>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

// Fila "Dejar de cuidar a X" con confirmación inline; revoca el vínculo propio
// con la misma acción que usa Familia.
function DejarDeCuidar({ nombre, vinculoId, alDejar }: { nombre: string; vinculoId: string; alDejar: ReturnType<typeof alDejarDeCuidar> }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [pendiente, startTransition] = useTransition();

  function quitar() {
    startTransition(async () => {
      try {
        const r = await dejarDeCuidarAction(vinculoId);
        if (r.status === "error") {
          toast.error(r.message);
          return;
        }
        toast.success(`Listo. Dejaste de cuidar a ${nombre}`);
        router.replace("/app");
        router.refresh();
      } catch {
        toast.error("No pudimos quitarlo de tu familia.");
      }
    });
  }

  if (!confirmando) {
    return (
      <button
        type="button"
        onClick={() => setConfirmando(true)}
        className="flex w-full items-center gap-3 border-t border-foreground/[0.06] px-4 py-3.5 text-left"
      >
        <Tile icon="users" tono="rose" />
        <div className="min-w-0 flex-1 font-heading text-[14.5px] font-extrabold tracking-[-0.02em] text-destructive">
          Dejar de cuidar a {nombre}
        </div>
      </button>
    );
  }

  return (
    <div className="border-t border-foreground/[0.06] p-4">
      <div className="font-heading text-[15px] font-extrabold tracking-[-0.02em]">¿Dejar de cuidar a {nombre}?</div>
      <p className="mt-1 text-[12.5px] font-medium leading-[1.45] text-subtle">
        Sale de tu lista y dejás de recibir sus avisos.
        {alDejar === "quedan-otros" && " Los otros cuidadores la siguen viendo."}
        {alDejar === "ultimo" &&
          " Hoy sos la única persona que la cuida y todavía no usa su celular: si te vas, nadie va a poder volver a abrir ese perfil."}
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={quitar}
          disabled={pendiente}
          className="flex-1 rounded-full bg-destructive py-3 font-heading text-[13.5px] font-extrabold text-primary-foreground disabled:opacity-60"
        >
          {pendiente ? "Quitando…" : "Dejar de cuidar"}
        </button>
        <button
          type="button"
          onClick={() => setConfirmando(false)}
          disabled={pendiente}
          className="flex-1 rounded-full bg-secondary py-3 font-heading text-[13.5px] font-extrabold"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
