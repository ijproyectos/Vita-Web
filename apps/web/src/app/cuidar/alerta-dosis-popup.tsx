"use client";

import { useState } from "react";
import Link from "next/link";
import { VitaIcon } from "@/lib/vita-icons";
import type { DosisVencidaCuidador } from "@/lib/cuidadores/tipos";

// Popup dentro de la app (pedido explícito del usuario: por ahora sin
// email, solo un aviso al entrar a /cuidar) — se muestra abierto de
// entrada si hay al menos una dosis vencida sin confirmar (`dosis` viene
// ya calculado del server component, listarDosisVencidasDeMisElders en
// lib/cuidadores/nucleo.ts). Estado local nada más: no hay backend de
// "ya lo vi" — cada visita a /cuidar que siga teniendo dosis vencidas
// vuelve a mostrarlo, a propósito (es una alerta, no una notificación que
// se descarta una sola vez).
export function AlertaDosisPopup({ dosis }: { dosis: DosisVencidaCuidador[] }) {
  const [abierto, setAbierto] = useState(true);
  if (!abierto || dosis.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-5">
      <div className="w-full max-w-sm rounded-[20px] bg-card p-5 shadow-[0_20px_50px_rgba(15,33,54,0.25)]">
        <div className="flex items-center gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-chip-rose-bg text-chip-rose-ink">
            <VitaIcon name="alert-triangle" size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-heading text-[17px] font-bold">Medicación sin confirmar</div>
            <div className="text-xs text-muted-foreground">
              {dosis.length === 1 ? "1 dosis" : `${dosis.length} dosis`} sin tomar
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-2">
          {dosis.map((d) => (
            <Link
              key={`${d.elderId}-${d.medicamentoId}`}
              href={`/cuidar/${d.elderId}`}
              onClick={() => setAbierto(false)}
              className="flex items-center gap-2.5 rounded-2xl bg-chip-rose-bg px-3.5 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-chip-rose-ink">{d.elderNombre}</div>
                <div className="truncate text-xs text-chip-rose-ink/80">
                  {d.nombre} · programada {d.horaProgramada} hs
                </div>
              </div>
              <VitaIcon name="chevron-right" size={16} className="shrink-0 text-chip-rose-ink" />
            </Link>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setAbierto(false)}
          className="mt-4 h-11 w-full rounded-full bg-muted text-sm font-semibold text-foreground"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}
