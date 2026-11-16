"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { descartarObservacionAction, marcarObservacionesVistasAction } from "@/lib/observaciones/actions";
import type { ItemObservacion } from "@/lib/observaciones/items";
import { cn } from "@/lib/utils";
import { VitaIcon } from "@/lib/vita-icons";

const TONO = {
  atencion: { caja: "bg-aviso-tint text-aviso-ink", etiqueta: "text-aviso-ink" },
  info: { caja: "bg-persona-1-tint text-persona-1-deep", etiqueta: "text-persona-1-deep" },
} as const;

/** Marca como vistas (una sola vez por conjunto de ids) las que se mostraron. Sin estado: no hay nada que re-renderizar. */
function useMarcarVistas(ids: string[], activo: boolean) {
  const clave = ids.join(",");
  const hecho = useRef("");
  useEffect(() => {
    if (!activo || !clave || hecho.current === clave) return;
    hecho.current = clave;
    void marcarObservacionesVistasAction(clave.split(",")).catch(() => {});
  }, [clave, activo]);
}

function useDescartar() {
  const [ocultas, setOcultas] = useState<Set<string>>(() => new Set());
  function descartar(id: string) {
    setOcultas((prev) => new Set(prev).add(id));
    void descartarObservacionAction(id)
      .then((r) => {
        if (r.status === "error") throw new Error(r.message);
      })
      .catch((e: unknown) => {
        setOcultas((prev) => {
          const sin = new Set(prev);
          sin.delete(id);
          return sin;
        });
        toast.error(e instanceof Error && e.message ? e.message : "No pudimos ocultar esta observación. Probá de nuevo.");
      });
  }
  return { ocultas, descartar };
}

function Acciones({ item, puedeDescartar, onDescartar }: { item: ItemObservacion; puedeDescartar: boolean; onDescartar: (id: string) => void }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
      {item.href && (
        <Link
          href={item.href}
          className="inline-flex items-center gap-1 rounded-full bg-primary px-4 py-2 text-[13px] font-extrabold text-primary-foreground shadow-cta"
        >
          Ir
          <VitaIcon name="chevron-right" size={14} strokeWidth={2.4} />
        </Link>
      )}
      {puedeDescartar && (
        <button type="button" onClick={() => onDescartar(item.id)} className="text-[12.5px] font-bold text-subtle underline-offset-2 hover:underline">
          No me lo muestres más
        </button>
      )}
    </div>
  );
}

function Contenido({ item, titulo: Titulo }: { item: ItemObservacion; titulo: "h2" | "h3" }) {
  const tono = TONO[item.severidad];
  return (
    <div className="flex items-start gap-3.5">
      <div className={cn("flex size-11 shrink-0 items-center justify-center rounded-full", tono.caja)} aria-hidden="true">
        <VitaIcon name={item.severidad === "atencion" ? "alert-triangle" : "sparkle"} size={20} strokeWidth={1.9} />
      </div>
      <div className="min-w-0 flex-1">
        <div className={cn("eyebrow", tono.etiqueta)}>vita notó…</div>
        <Titulo className="mt-1 text-balance break-words font-heading text-[17px] font-extrabold leading-[1.2] tracking-[-0.02em]">{item.titulo}</Titulo>
        <p className="mt-1 text-pretty break-words text-[13px] font-medium leading-[1.45] text-slate-brand">{item.texto}</p>
      </div>
    </div>
  );
}

/**
 * Tarjeta "vita notó…" del Inicio: la observación más importante y "Ver todas". `puedeDescartar` es false para un
 * Lector (solo mira: no marca vista ni descarta; la RLS tampoco lo deja).
 */
export function TarjetaObservaciones({ items, puedeDescartar }: { items: ItemObservacion[]; puedeDescartar: boolean }) {
  const { ocultas, descartar } = useDescartar();
  const visibles = items.filter((i) => !ocultas.has(i.id));
  const principal = visibles[0];
  useMarcarVistas(principal && !principal.vista ? [principal.id] : [], puedeDescartar);
  if (!principal) return null;
  return (
    <section aria-label="Lo que vita notó" className="rounded-[var(--radius-card)] bg-card p-[18px] shadow-card">
      <Contenido item={principal} titulo="h2" />
      <Acciones item={principal} puedeDescartar={puedeDescartar} onDescartar={descartar} />
      <div className="mt-3 border-t border-foreground/[0.06] pt-3">
        <Link href="/app/observaciones" className="inline-flex items-center gap-0.5 text-[13px] font-bold text-teal-deep">
          Ver todas{visibles.length > 1 ? ` (${visibles.length})` : ""}
          <VitaIcon name="chevron-right" size={15} strokeWidth={2.4} />
        </Link>
      </div>
    </section>
  );
}

/** Lista completa de `/app/observaciones`. */
export function ListaObservaciones({ items, puedeDescartar }: { items: ItemObservacion[]; puedeDescartar: boolean }) {
  const { ocultas, descartar } = useDescartar();
  const visibles = items.filter((i) => !ocultas.has(i.id));
  useMarcarVistas(visibles.filter((i) => !i.vista).slice(0, 20).map((i) => i.id), puedeDescartar);
  if (visibles.length === 0) {
    return (
      <div className="rounded-[var(--radius-card)] bg-card p-[18px] text-[13.5px] font-medium leading-[1.45] text-subtle shadow-card">
        Por ahora vita no notó nada para avisarte. Cuando cargues tus tomas, mediciones y estudios, acá aparece lo que conviene mirar.
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {visibles.map((item) => (
        <li key={item.id} className="rounded-[var(--radius-card)] bg-card p-[18px] shadow-card">
          <Contenido item={item} titulo="h3" />
          <Acciones item={item} puedeDescartar={puedeDescartar} onDescartar={descartar} />
        </li>
      ))}
    </ul>
  );
}
