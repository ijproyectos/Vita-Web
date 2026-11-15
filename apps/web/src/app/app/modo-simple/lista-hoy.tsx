"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { TarjetaHoy, type ExtraHoy } from "@/components/vita/modo-simple/piezas";
import { TecladoMedicion } from "./teclado-medicion";
import { cn } from "@/lib/utils";
import { horaCorta } from "@/lib/notificaciones/mensajes";
import type { FilaHoy } from "@/lib/modo-simple/seleccion";
import { marcarGrupoNoTomadoAction, marcarGrupoTomadoAction } from "../rutina/actions";

import { RUTA_TURNO_SIMPLE } from "./turno/ruta";

export const RUTA_RUTINA_SIMPLE = "/app/modo-simple/rutina";


/** La lista "Hoy" con su hoja: tomarla, decir que no o deshacer, de a una. */
export function ListaHoyInteractiva({ filas, abrirId, extras = [] }: { filas: FilaHoy[]; abrirId?: string | null; extras?: ExtraHoy[] }) {
  const router = useRouter();
  // Una medición pendiente de la lista abre el teclado grande.
  const [medir, setMedir] = useState<ExtraHoy | null>(null);
  const [filaElegida, setFilaElegida] = useState<FilaHoy | null>(() => filas.find((f) => f.id === abrirId) ?? null);
  const [, startTransition] = useTransition();

  function accionFila(fila: FilaHoy, accion: "tomar" | "no" | "desmarcar") {
    setFilaElegida(null);
    startTransition(async () => {
      try {
        const r =
          accion === "no"
            ? await marcarGrupoNoTomadoAction([fila.id])
            : await marcarGrupoTomadoAction([fila.id], accion === "tomar");
        if (r.status === "error") {
          toast.error(r.message);
          return;
        }
        toast.success(accion === "tomar" ? "¡Muy bien! Quedó anotada." : accion === "no" ? "Listo. No te la vuelvo a pedir hoy." : "Listo, la desmarqué.");
        router.refresh();
      } catch {
        toast.error("No se pudo guardar. Probá de nuevo.");
      }
    });
  }

  return (
    <>
      <TarjetaHoy filas={filas} onTocar={setFilaElegida} extras={extras} onTocarExtra={(x) => (x.tipo === "turno" ? router.push(`${RUTA_TURNO_SIMPLE}?desde=rutina`) : x.tipoMedir && setMedir(x))} />
      <SheetFila fila={filaElegida} onCerrar={() => setFilaElegida(null)} onAccion={accionFila} />
      {medir?.tipoMedir && <TecladoMedicion tipo={medir.tipoMedir} onCerrar={() => setMedir(null)} />}
    </>
  );
}

/** Qué hacer con una pastilla de la lista "Hoy", según cómo está. */
function SheetFila({
  fila,
  onCerrar,
  onAccion,
}: {
  fila: FilaHoy | null;
  onCerrar: () => void;
  onAccion: (fila: FilaHoy, accion: "tomar" | "no" | "desmarcar") => void;
}) {
  const boton = "flex h-16 w-full items-center justify-center rounded-full text-[20px] font-extrabold";
  const titulo = !fila
    ? ""
    : fila.estado === "tomada"
      ? `¿No tomaste ${fila.nombre}?`
      : fila.estado === "omitida"
        ? `¿Al final tomaste ${fila.nombre}?`
        : `¿Tomaste ${fila.nombre}?`;
  return (
    <Sheet open={!!fila} onOpenChange={(v) => !v && onCerrar()}>
      <SheetContent side="bottom" className="rounded-t-[28px] pb-8">
        <SheetHeader>
          <SheetTitle className="text-[24px]">{titulo}</SheetTitle>
          <SheetDescription className="text-[17px]">{fila ? `La de las ${horaCorta(fila.hora)}.` : ""}</SheetDescription>
        </SheetHeader>
        {fila && (
          <div className="flex flex-col gap-3 px-4">
            {fila.estado === "tomada" ? (
              <button type="button" onClick={() => onAccion(fila, "desmarcar")} className={cn(boton, "bg-teal-deep text-primary-foreground")}>
                Me equivoqué, no la tomé
              </button>
            ) : (
              <button type="button" onClick={() => onAccion(fila, "tomar")} className={cn(boton, "bg-teal-deep text-primary-foreground")}>
                Sí, ya la tomé
              </button>
            )}
            {(fila.estado === "se-paso" || fila.estado === "ahora") && (
              <button type="button" onClick={() => onAccion(fila, "no")} className={cn(boton, "border-2 border-foreground/10 bg-card text-foreground")}>
                No la tomé
              </button>
            )}
            <button type="button" onClick={onCerrar} className="flex h-14 items-center justify-center rounded-full bg-secondary text-[18px] font-bold text-slate-brand">
              Volver
            </button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

