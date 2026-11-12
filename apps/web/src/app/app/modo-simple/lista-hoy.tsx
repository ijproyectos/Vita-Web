"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { TarjetaHoy, type ExtraHoy } from "@/components/vita/modo-simple/piezas";
import { TecladoMedicion } from "./teclado-medicion";
import { VitaIcon } from "@/lib/vita-icons";
import { cn } from "@/lib/utils";
import { horaCorta } from "@/lib/notificaciones/mensajes";
import type { FilaHoy } from "@/lib/modo-simple/seleccion";
import { marcarGrupoNoTomadoAction, marcarGrupoTomadoAction } from "../rutina/actions";

export const RUTA_RUTINA_SIMPLE = "/app/modo-simple/rutina";

/**
 * En la pantalla principal del modo simple: el aviso de una pastilla que se pasó
 * (queda a la vista a propósito, no escondida en la otra pantalla) y el botón a
 * "Tu rutina de hoy" con un resumen corto.
 */
export function AccesoRutinaCompleta({ filas, children }: { filas: FilaHoy[]; children?: React.ReactNode }) {
  const sePasaron = filas.filter((f) => f.estado === "se-paso");
  const cuenta = (estado: FilaHoy["estado"]) => filas.filter((f) => f.estado === estado).length;
  const resumen = [
    cuenta("tomada") > 0 && `${cuenta("tomada")} ${cuenta("tomada") === 1 ? "tomada" : "tomadas"}`,
    sePasaron.length > 0 && `${sePasaron.length} se ${sePasaron.length === 1 ? "pasó" : "pasaron"}`,
    cuenta("mas-tarde") > 0 && `${cuenta("mas-tarde")} más tarde`,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="flex flex-col gap-3">
      {sePasaron.length > 0 && (
        <Link
          href={`${RUTA_RUTINA_SIMPLE}?abrir=${encodeURIComponent(sePasaron[0].id)}`}
          className="flex items-center gap-3 rounded-[var(--radius-item)] bg-aviso-tint px-4 py-3.5 text-aviso-ink shadow-item"
        >
          <VitaIcon name="alert-triangle" size={22} strokeWidth={2.4} className="shrink-0" />
          <span className="min-w-0 flex-1 text-[17px] font-bold leading-snug">
            {sePasaron.length === 1
              ? `Se te pasó ${sePasaron[0].nombre} de las ${horaCorta(sePasaron[0].hora)}`
              : `Se te pasaron ${sePasaron.length} pastillas`}
          </span>
          <VitaIcon name="chevron-right" size={20} className="shrink-0" />
        </Link>
      )}
      {children}
      <Link
        href={RUTA_RUTINA_SIMPLE}
        className="flex min-h-[72px] items-center gap-3.5 rounded-[var(--radius-card)] bg-card px-5 py-4 shadow-card transition-transform active:scale-[0.99] motion-reduce:transition-none"
      >
        <span className="flex size-12 shrink-0 items-center justify-center rounded-[var(--radius-tile)] bg-persona-1-tint text-teal-deep">
          <VitaIcon name="routine" size={24} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-heading text-[20px] font-extrabold tracking-[-0.02em]">Ver rutina completa</span>
          {resumen && <span className="mt-0.5 block text-[15px] font-semibold text-subtle">{resumen}</span>}
        </span>
        <VitaIcon name="chevron-right" size={22} className="shrink-0 text-subtle" />
      </Link>
    </div>
  );
}

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
      <TarjetaHoy filas={filas} onTocar={setFilaElegida} extras={extras} onTocarExtra={(x) => x.tipoMedir && setMedir(x)} />
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

