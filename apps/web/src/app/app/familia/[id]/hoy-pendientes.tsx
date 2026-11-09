"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { recordarleAction } from "@/app/cuidar/[elderId]/actions";
import type { DosisPendiente } from "@/lib/familia/pendientes-hoy";

const SIN_CELULAR = "Conectá su celular para que le lleguen los avisos";
const SIN_AVISOS = "No tiene avisos activados en su celular. Probá con una llamada o un WhatsApp.";

/** Dosis sin confirmar de hoy. "Avisado" solo aparece si el servidor lo confirmó. */
export function HoyPendientes({
  elderId,
  nombre,
  subtitulo,
  pendientes,
  conectado,
  puedeRecordar,
}: {
  elderId: string;
  nombre: string;
  subtitulo: string;
  pendientes: DosisPendiente[];
  conectado: boolean;
  puedeRecordar: boolean;
}) {
  const [avisados, setAvisados] = useState<string[]>([]);
  const [pendiente, iniciar] = useTransition();
  const sinAvisar = pendientes.filter((p) => !avisados.includes(p.id));

  function recordar(ids: string[]) {
    if (!conectado) {
      toast.info(SIN_CELULAR);
      return;
    }
    iniciar(async () => {
      const logrados: string[] = [];
      let enviados = 0;
      for (const id of ids) {
        const r = await recordarleAction(elderId, id).catch(() => null);
        if (r?.status === "enviado") enviados++;
        if (r?.status === "enviado" || r?.status === "repetido" || r?.status === "ya-tomada") logrados.push(id);
        if (r?.status === "sin-avisos") {
          toast.info(SIN_AVISOS);
          break;
        }
        if (!r || r.status === "error") {
          toast.error(r?.message ?? "No pudimos enviar el recordatorio. Probá de nuevo.");
          break;
        }
      }
      setAvisados((a) => [...a, ...logrados]);
      if (enviados > 0) toast.success(`Le mandamos el aviso a ${nombre}`);
      else if (logrados.length > 0) toast.info("Ya le recordaste hace un rato");
    });
  }

  return (
    <section>
      <div className="flex items-baseline justify-between gap-2.5 px-0.5 pb-2.5">
        <h2 className="eyebrow text-subtle">Hoy</h2>
        <span className="text-[11.5px] font-semibold text-subtle">{subtitulo}</span>
      </div>
      <div className="rounded-[20px] bg-card shadow-card">
        <div className="flex items-center gap-3 px-4 pb-2.5 pt-[15px]">
          <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-aviso ring-4 ring-aviso/15" />
          <div className="min-w-0 flex-1">
            <div className="font-heading text-[14.5px] font-extrabold tracking-[-0.02em]">
              {pendientes.length === 1 ? "1 dosis sin confirmar" : `${pendientes.length} dosis sin confirmar`}
            </div>
            <div className="mt-0.5 text-[11.5px] font-medium text-subtle">Le llega un aviso a su celular</div>
          </div>
          {puedeRecordar && sinAvisar.length > 1 && (
            <button type="button" disabled={pendiente} onClick={() => recordar(sinAvisar.map((p) => p.id))} className="shrink-0 text-[12.5px] font-extrabold text-teal-deep disabled:opacity-60">
              Recordarle todo
            </button>
          )}
        </div>
        <ul>
          {pendientes.map((p) => {
            const avisado = avisados.includes(p.id);
            return (
              <li key={p.id} className="flex items-center gap-3 border-t border-foreground/[0.05] px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-bold">{p.nombre}</div>
                  <div className="mt-0.5 truncate text-[11.5px] font-medium text-subtle">{p.meta}</div>
                </div>
                {puedeRecordar && (
                  <button
                    type="button"
                    disabled={pendiente}
                    onClick={() => recordar([p.id])}
                    className={`shrink-0 rounded-full px-3.5 py-[9px] text-[12.5px] font-extrabold disabled:opacity-60 ${avisado ? "bg-secondary text-subtle" : "bg-primary text-primary-foreground"}`}
                  >
                    {avisado ? "Avisado" : "Recordarle"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
