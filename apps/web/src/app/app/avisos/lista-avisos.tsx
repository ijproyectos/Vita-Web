"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { VitaIcon } from "@/lib/vita-icons";
import { cn } from "@/lib/utils";
import { marcarAvisoLeidoAction, marcarTodosLeidosAction } from "@/lib/notificaciones/actions";

export type ItemAviso = {
  id: string;
  tipo: string;
  titulo: string;
  cuerpo: string;
  url: string | null;
  leido: boolean;
  /** Ya formateado en hora AR ("08:30" hoy, "12 oct · 08:30" antes). */
  cuando: string;
};

export type GrupoAvisos = { titulo: string; items: ItemAviso[] };

const ICONO: Record<string, { icon: string; clases: string }> = {
  dosis: { icon: "pill", clases: "bg-persona-1-tint text-persona-1-deep" },
  dosis_pospuesta: { icon: "clock", clases: "bg-persona-1-tint text-persona-1-deep" },
  dosis_segundo: { icon: "alert-triangle", clases: "bg-aviso-tint text-aviso-ink" },
  dosis_vencida_cuidador: { icon: "alert-triangle", clases: "bg-aviso-tint text-aviso-ink" },
  dosis_resuelta_cuidador: { icon: "check", clases: "bg-persona-1-tint text-persona-1-deep" },
  recordatorio_familiar: { icon: "bell", clases: "bg-persona-1-tint text-persona-1-deep" },
  turno_dia_antes: { icon: "stethoscope", clases: "bg-persona-2-tint text-persona-2" },
  turno_2h: { icon: "stethoscope", clases: "bg-persona-2-tint text-persona-2" },
  stock_bajo: { icon: "alert-triangle", clases: "bg-secondary text-slate-brand" },
};

export function ListaAvisos({ grupos, hayNoLeidos }: { grupos: GrupoAvisos[]; hayNoLeidos: boolean }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();

  function abrir(item: ItemAviso) {
    startTransition(async () => {
      try {
        if (!item.leido) await marcarAvisoLeidoAction(item.id);
      } catch {
        // marcar como leído es secundario: igual se navega.
      }
      if (item.url && item.url.startsWith("/")) router.push(item.url);
      else router.refresh();
    });
  }

  function marcarTodos() {
    startTransition(async () => {
      try {
        const r = await marcarTodosLeidosAction();
        if (r.status === "error") toast.error(r.message);
        else router.refresh();
      } catch {
        toast.error("No pudimos marcar los avisos como leídos.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-[18px]">
      {hayNoLeidos && (
        <button
          type="button"
          onClick={marcarTodos}
          disabled={pendiente}
          className="self-end rounded-full px-3 py-1.5 text-[12.5px] font-bold text-teal-deep disabled:opacity-60"
        >
          Marcar todo como leído
        </button>
      )}
      {grupos.map((g) => (
        <section key={g.titulo}>
          <h2 className="eyebrow px-0.5 pb-[9px] text-subtle">{g.titulo}</h2>
          <ul className="overflow-hidden rounded-[20px] bg-card shadow-card">
            {g.items.map((item) => {
              const estilo = ICONO[item.tipo] ?? ICONO.recordatorio_familiar;
              return (
                <li key={item.id} className="[&:not(:first-child)]:border-t [&:not(:first-child)]:border-foreground/[0.06]">
                  <button
                    type="button"
                    onClick={() => abrir(item)}
                    disabled={pendiente}
                    className="flex w-full items-start gap-3 px-4 py-3.5 text-left disabled:opacity-70"
                  >
                    <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-tile)]", estilo.clases)}>
                      <VitaIcon name={estilo.icon} size={17} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className={cn("font-heading text-[14px] tracking-[-0.02em]", item.leido ? "font-bold" : "font-extrabold")}>
                        {item.titulo}
                      </div>
                      {item.cuerpo && (
                        <div className="mt-0.5 text-[12px] font-medium leading-snug text-subtle text-pretty">{item.cuerpo}</div>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <span className="text-[11px] font-semibold tabular-nums text-subtle">{item.cuando}</span>
                      {!item.leido && <span aria-label="Sin leer" className="size-2 rounded-full bg-primary" />}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
