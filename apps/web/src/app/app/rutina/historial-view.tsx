"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  construirCalendario,
  dosisDelDia,
  etiquetaDiaHistorial,
  type CeldaDia,
} from "@/lib/rutina/historial";
import type { Medicamento, TomaRegistrada } from "@/lib/medicamentos/tipos";
import { VitaIcon } from "@/lib/vita-icons";

// Rutina → Historial (V7 D:285 "isRutinaHist"): calendario de 5 semanas con un
// punto por día (verde = tomó todo, rojo = alguna olvidada, aro = hoy, punto
// violeta = hubo una medición) y la lista del día elegido. Todo sale de las
// tomas y mediciones reales; un día sin medicamentos esperados no tiene punto.

export type MedicionDia = { fecha: string; hora: string; nombre: string; valor: string; unidad: string };

const DIAS_CABECERA = ["L", "M", "M", "J", "V", "S", "D"];

function claseDia(c: CeldaDia): { punto: string; aro: string } {
  const punto = c.estado === "ok" ? "bg-primary" : c.estado === "miss" ? "bg-destructive" : "bg-transparent";
  const aro = c.estado === "hoy" ? "shadow-[inset_0_0_0_1.5px_var(--primary)]" : "";
  return { punto, aro };
}

export function HistorialView({
  meds,
  tomas,
  mediciones,
  hoy,
  puedeEditar,
}: {
  meds: Medicamento[];
  tomas: TomaRegistrada[];
  mediciones: MedicionDia[];
  hoy: string;
  puedeEditar: boolean;
}) {
  const [elegido, setElegido] = useState(hoy);

  if (meds.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-[20px] bg-card px-5 pb-[22px] pt-[26px] text-center shadow-card">
        <div className="flex size-12 items-center justify-center rounded-full bg-persona-1-tint text-primary">
          <VitaIcon name="clock" size={22} />
        </div>
        <div className="mt-0.5 font-heading text-[15px] font-extrabold tracking-[-0.02em]">Todavía no hay tomas</div>
        <div className="max-w-[280px] text-balance text-[12.5px] font-medium leading-[1.45] text-subtle">
          Cuando cargues un remedio, acá vas a ver qué días se tomó todo y cuáles no.
        </div>
        {puedeEditar && (
          <Link
            href="/app/agregar-medicamento"
            className="mt-2 rounded-full bg-primary px-5 py-[11px] text-[13.5px] font-extrabold text-primary-foreground shadow-cta"
          >
            Agregar un remedio
          </Link>
        )}
      </div>
    );
  }

  const fechasConMedicion = new Set(mediciones.map((m) => m.fecha));
  const { celdas, completos, contados, mesEtiqueta } = construirCalendario(meds, tomas, fechasConMedicion, hoy);
  const dosis = dosisDelDia(meds, tomas, elegido, hoy);
  const medicionesDia = mediciones.filter((m) => m.fecha === elegido).sort((a, b) => a.hora.localeCompare(b.hora));

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-[20px] bg-card px-3.5 pb-3.5 pt-4 shadow-card">
        <div className="px-1">
          <div className="eyebrow text-subtle">{mesEtiqueta}</div>
          <div className="mt-1 font-heading text-[17px] font-extrabold tracking-[-0.02em]">
            {contados === 0 ? "Todavía sin días completos" : `${completos} de ${contados} días completos`}
          </div>
        </div>

        <div className="mt-3.5 grid grid-cols-7">
          {DIAS_CABECERA.map((d, i) => (
            <div key={i} className="pb-1.5 text-center text-[10.5px] font-bold text-faint">
              {d}
            </div>
          ))}
          {celdas.map((c) => {
            const futuro = c.estado === "futuro";
            const esElegido = c.fecha === elegido;
            const { punto, aro } = claseDia(c);
            return (
              <button
                key={c.fecha}
                type="button"
                disabled={futuro}
                onClick={() => setElegido(c.fecha)}
                aria-label={etiquetaDiaHistorial(c.fecha, hoy)}
                aria-pressed={esElegido}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-[12px] pb-[7px] pt-1.5 disabled:cursor-default",
                  esElegido && "bg-persona-1-tint"
                )}
              >
                <span className="h-2.5 text-[8.5px] font-extrabold uppercase leading-[10px] tracking-[0.06em] text-subtle">{c.mes}</span>
                <span
                  className={cn(
                    "text-[13.5px] leading-none tabular-nums",
                    futuro ? "text-line" : "text-foreground",
                    esElegido || c.fecha === hoy ? "font-extrabold" : "font-semibold"
                  )}
                >
                  {c.n}
                </span>
                <span className="flex gap-[3px]">
                  <span className={cn("size-[7px] rounded-full", punto, aro)} />
                  <span className={cn("mt-px size-[5px] rounded-full", c.conMedicion ? "bg-violet" : "bg-transparent")} />
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap gap-x-3.5 gap-y-1.5 border-t border-line-soft px-1 pt-3">
          <Leyenda clase="bg-primary" texto="Tomó todo" />
          <Leyenda clase="bg-destructive" texto="Alguna olvidada" />
          <Leyenda clase="bg-violet" texto="Medición" chico />
        </div>
      </div>

      <div>
        <div className="eyebrow px-0.5 pb-[9px] text-subtle">{etiquetaDiaHistorial(elegido, hoy)}</div>
        <div className="overflow-hidden rounded-[18px] bg-card shadow-item">
          {dosis.length === 0 ? (
            <div className="px-3.5 py-3 text-[13px] font-medium text-subtle">No había remedios para este día.</div>
          ) : (
            dosis.map((d, i) => (
              <div key={d.medicamentoId} className={cn("flex items-center gap-3 px-3.5 py-3", i > 0 && "border-t border-line-soft")}>
                <div className="w-11 shrink-0 text-[13px] font-bold tabular-nums text-subtle">{d.hora}</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-heading text-sm font-extrabold tracking-[-0.02em]">{d.nombre}</div>
                  {d.dosis && <div className="mt-px text-[11.5px] font-medium text-subtle">{d.dosis}</div>}
                </div>
                <div
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 text-[12.5px] font-bold tabular-nums",
                    d.estado === "ok" ? "text-teal-deep" : d.estado === "miss" ? "text-destructive" : "text-subtle"
                  )}
                >
                  <span
                    className={cn(
                      "size-[7px] rounded-full",
                      d.estado === "ok" ? "bg-primary" : d.estado === "miss" ? "bg-destructive" : "bg-transparent shadow-[inset_0_0_0_1.5px_var(--faint)]"
                    )}
                  />
                  {d.estado === "ok" ? (d.tomadoA ? `Tomó ${d.tomadoA}` : "Tomó") : d.estado === "miss" ? "No confirmó" : "Pendiente"}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {medicionesDia.length > 0 && (
        <div>
          <div className="eyebrow px-0.5 pb-[9px] text-subtle">Mediciones</div>
          <div className="overflow-hidden rounded-[18px] bg-card shadow-item">
            {medicionesDia.map((m, i) => (
              <div key={`${m.hora}-${m.nombre}-${i}`} className={cn("flex items-center gap-3 px-3.5 py-3", i > 0 && "border-t border-line-soft")}>
                <div className="w-11 shrink-0 text-[13px] font-bold tabular-nums text-subtle">{m.hora}</div>
                <div className="min-w-0 flex-1 font-heading text-sm font-extrabold tracking-[-0.02em]">{m.nombre}</div>
                <div className="shrink-0 text-sm font-extrabold tabular-nums">
                  {m.valor} <span className="text-[11.5px] font-semibold text-subtle">{m.unidad}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Leyenda({ clase, texto, chico }: { clase: string; texto: string; chico?: boolean }) {
  return (
    <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-slate-brand">
      <span className={cn("rounded-full", chico ? "size-[5px]" : "size-[7px]", clase)} />
      {texto}
    </div>
  );
}
