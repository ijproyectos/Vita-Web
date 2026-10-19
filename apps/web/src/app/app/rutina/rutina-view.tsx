"use client";

import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { VitaIcon } from "@/lib/vita-icons";
import { ProgressRing } from "@/components/vita/progress-ring";
import { CheckToggle } from "./check-toggle";
import { EliminarMedButton } from "./eliminar-med-button";
import { MarcarTodosButton } from "./marcar-todos-button";
import { AgregarSheet } from "./agregar-sheet";
import { ORDEN_MOMENTOS, ETIQUETA_MOMENTO, RANGO_MOMENTO } from "@/lib/rutina/momento";
import { momentoDelDia } from "@/lib/rutina/momento";
import { diaYMes, fechaDeHoyISO, formatoFechaCorta } from "@/lib/rutina/formato";
import { iconoDeEspecialidad } from "@/lib/turnos/icono";
import { BadgeStock } from "@/components/vita/badge-stock";
import type { ResumenStock } from "@/lib/inventario/tipos";
import { colorChipPorIndice } from "@/lib/perfil/tipos";
import type { Medicamento, MedicamentoConToma } from "@/lib/medicamentos/tipos";
import type { Turno } from "@/lib/turnos/tipos";
import type { ResumenAdherencia } from "@/lib/medicamentos/tipos";

const ICONO_MOMENTO = { "mañana": "sunrise", mediodia: "sun", tarde: "sunset", noche: "moon" } as const;
const ETIQUETA_MOMENTO_CORTA = { "mañana": "Mañana", mediodia: "Mediodía", tarde: "Tarde", noche: "Noche" } as const;
const ETIQUETA_DIA_CORTA: Record<string, string> = {
  lunes: "Lu",
  martes: "Ma",
  miercoles: "Mi",
  jueves: "Ju",
  viernes: "Vi",
  sabado: "Sa",
  domingo: "Do",
};

export function RutinaView({
  medsHoy,
  todosLosMeds,
  turnosHoy,
  turnosProximos,
  adherencia,
  stockPorInventario,
}: {
  medsHoy: MedicamentoConToma[];
  todosLosMeds: Medicamento[];
  turnosHoy: Turno[];
  turnosProximos: Turno[];
  adherencia: ResumenAdherencia;
  stockPorInventario: Record<string, ResumenStock>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const vista = searchParams.get("vista") === "proximos" ? "proximos" : "hoy";
  const [showAdd, setShowAdd] = useState(false);

  const tomados = medsHoy.filter((m) => m.tomado).length;
  const total = medsHoy.length;
  const pct = total === 0 ? 0 : Math.round((tomados / total) * 100);

  function cambiarVista(v: "hoy" | "proximos") {
    router.push(v === "hoy" ? "/app/rutina" : "/app/rutina?vista=proximos", { scroll: false });
  }

  return (
    <div className="flex flex-col gap-[18px] px-[18px] pt-1.5">
      <div className="mt-1.5 flex items-start justify-between">
        <div>
          <div className="eyebrow text-primary">Tu día de salud</div>
          <h1 className="mt-[5px] font-heading text-[28px] font-extrabold tracking-[-0.04em]">Mi Rutina</h1>
        </div>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          aria-label="Agregar a tu rutina"
          className="flex size-[42px] shrink-0 items-center justify-center rounded-full bg-card shadow-card transition-transform active:scale-[0.94] motion-reduce:transition-none"
        >
          <VitaIcon name="plus" size={20} />
        </button>
      </div>

      {/* TODO(fase historial): V7 suma la pestaña "Historial". */}
      <div role="tablist" aria-label="Vista de la rutina" className="flex rounded-full bg-secondary p-1">
        {(["hoy", "proximos"] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={vista === v}
            onClick={() => cambiarVista(v)}
            className={
              "flex-1 rounded-full px-3 py-2.5 text-[13px] font-bold tracking-[-0.01em] transition-all motion-reduce:transition-none " +
              (vista === v ? "bg-card text-foreground shadow-item" : "text-subtle")
            }
          >
            {v === "hoy" ? "Hoy" : "Próximos días"}
          </button>
        ))}
      </div>

      {vista === "hoy" ? (
        <>
          <div className="flex items-center gap-4 rounded-[20px] bg-card p-[18px] shadow-card">
            <div className="min-w-0 flex-1">
              <div className="eyebrow text-subtle">Hoy · {formatoFechaCorta(fechaDeHoyISO())}</div>
              <div className="mt-2 font-heading text-[42px] font-bold leading-[0.95] tracking-[-0.04em] tabular-nums">
                <span className="text-primary">{tomados}</span>/{total}
              </div>
              <div className="mt-1.5 text-[12.5px] font-semibold text-slate-brand">
                medicamentos · {turnosHoy.length} turno{turnosHoy.length !== 1 ? "s" : ""}
              </div>
              {adherencia.rachaDias > 0 && (
                <div className="mt-1.5 flex items-center gap-1 text-[12px] font-medium text-subtle">
                  <VitaIcon name="flame" size={12} /> Llevás {adherencia.rachaDias}{" "}
                  {adherencia.rachaDias === 1 ? "día" : "días"} sin saltarte ninguno
                </div>
              )}
            </div>
            <ProgressRing pct={pct} size={74} tono="card" />
          </div>

          {tomados < total && <MarcarTodosButton />}

          <TimelineHoy
            medsHoy={medsHoy}
            turnosHoy={turnosHoy}
            stockPorInventario={stockPorInventario}
            onAgregar={() => setShowAdd(true)} />
        </>
      ) : (
        <ProximosDias turnos={turnosProximos} todosLosMeds={todosLosMeds} />
      )}

      <AgregarSheet open={showAdd} onOpenChange={setShowAdd} />
    </div>
  );
}

function TimelineHoy({
  medsHoy,
  turnosHoy,
  stockPorInventario,
  onAgregar,
}: {
  medsHoy: MedicamentoConToma[];
  turnosHoy: Turno[];
  stockPorInventario: Record<string, ResumenStock>;
  onAgregar: () => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      {ORDEN_MOMENTOS.map((momento) => {
        const meds = medsHoy.filter((m) => m.momento_dia === momento).sort((a, b) => a.hora_programada.localeCompare(b.hora_programada));
        const turnos = turnosHoy
          .filter((t) => momentoDelDia(t.hora) === momento)
          .sort((a, b) => a.hora.localeCompare(b.hora));
        const total = meds.length + turnos.length;

        if (total === 0) {
          return (
            <div key={momento} className="flex items-center gap-2.5">
              <div className="flex size-[34px] items-center justify-center rounded-[var(--radius-tile)] bg-card text-subtle shadow-item">
                <VitaIcon name={ICONO_MOMENTO[momento]} size={17} />
              </div>
              <div className="flex-1">
                <div className="font-heading text-[15px] font-extrabold tracking-[-0.02em] text-slate-brand">{ETIQUETA_MOMENTO[momento]}</div>
                <div className="text-[11px] font-medium tabular-nums text-subtle">{RANGO_MOMENTO[momento]} hs · sin items</div>
              </div>
              <button type="button" onClick={onAgregar} className="text-[12.5px] font-bold text-teal-deep">
                + Agregar
              </button>
            </div>
          );
        }

        return (
          <div key={momento}>
            <div className="flex items-center gap-[11px] pb-[11px] pl-0.5">
              <div className="flex size-[34px] items-center justify-center rounded-[var(--radius-tile)] bg-card text-slate-brand shadow-item">
                <VitaIcon name={ICONO_MOMENTO[momento]} size={17} />
              </div>
              <div className="flex-1">
                <div className="font-heading text-[15px] font-extrabold tracking-[-0.02em]">{ETIQUETA_MOMENTO[momento]}</div>
                <div className="text-[11px] font-medium tabular-nums text-subtle">
                  {RANGO_MOMENTO[momento]} hs · {total} item{total !== 1 ? "s" : ""}
                </div>
              </div>
            </div>
            <div className="relative flex flex-col gap-2 pl-[15px]">
              <div className="absolute inset-y-3 left-1 w-0.5 rounded-full bg-border" />
              {meds.map((m, i) => (
                <MedItem
                  key={m.id}
                  med={m}
                  color={colorChipPorIndice(i)}
                  stock={m.inventario_id ? (stockPorInventario[m.inventario_id] ?? null) : null}
                />
              ))}
              {turnos.map((t) => (
                <AptItem key={t.id} turno={t} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MedItem({
  med,
  color,
  stock,
}: {
  med: MedicamentoConToma;
  color: ReturnType<typeof colorChipPorIndice>;
  stock: ResumenStock | null;
}) {
  const TINTE_BG = {
    teal: "bg-chip-teal-bg text-chip-teal-ink",
    violet: "bg-chip-violet-bg text-chip-violet-ink",
    amber: "bg-chip-amber-bg text-chip-amber-ink",
    rose: "bg-chip-rose-bg text-chip-rose-ink",
  } as const;

  return (
    <div className="relative">
      <span
        className={
          "absolute -left-[15px] top-6 size-2.5 rounded-full " +
          (med.tomado ? "bg-primary" : "bg-card ring-2 ring-border")
        }
      />
      <div className="flex items-center gap-3 rounded-[var(--radius-item)] bg-card p-3 shadow-item">
        <div className={`flex size-10 shrink-0 items-center justify-center rounded-[13px] ${TINTE_BG[color]}`}>
          <VitaIcon name="pill" size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className={"truncate font-heading text-[14.5px] font-extrabold tracking-[-0.02em] " + (med.tomado ? "opacity-55 line-through" : "")}>
            {med.nombre}
          </div>
          <div className={"mt-0.5 text-[11.5px] font-medium text-subtle " + (med.tomado ? "opacity-60" : "")}>
            {med.dosis ? `${med.dosis} · ` : ""}
            {med.hora_programada} hs
          </div>
          {stock && <BadgeStock stock={stock} className="mt-1" />}
        </div>
        <div className="flex items-center gap-1">
          <EliminarMedButton medicamentoId={med.id} nombre={med.nombre} />
          <CheckToggle medicamentoId={med.id} tomadoInicial={med.tomado} />
        </div>
      </div>
    </div>
  );
}

function AptItem({ turno }: { turno: Turno }) {
  return (
    <div className="relative">
      <span className="absolute -left-[15px] top-6 size-2.5 rounded-full bg-primary" />
      <div className="flex items-center gap-3 rounded-[var(--radius-item)] bg-card p-3 shadow-item">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-[13px] bg-persona-1-tint text-persona-1">
          <VitaIcon name={iconoDeEspecialidad(turno.especialidad)} size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-heading text-[14.5px] font-extrabold tracking-[-0.02em]">{turno.especialidad}</div>
          <div className="mt-0.5 truncate text-[11.5px] font-medium text-subtle">
            {[turno.profesional, turno.lugar].filter(Boolean).join(" · ") || "Turno médico"}
          </div>
        </div>
        <div className="text-[13px] font-bold tabular-nums">{turno.hora}</div>
      </div>
    </div>
  );
}

function ProximosDias({ turnos, todosLosMeds }: { turnos: Turno[]; todosLosMeds: Medicamento[] }) {
  // Meds con dias_recurrentes puntuales (no todos los días) son invisibles
  // en la vista "Hoy" cualquier día que no les toque — hallazgo real del
  // review: no había NINGUNA pantalla donde revisarlos el resto de la
  // semana. Esta lista los muestra siempre, con sus días, sin depender de
  // qué día es hoy.
  const medsConDiasLimitados = todosLosMeds.filter((m) => m.dias_recurrentes.length > 0);

  if (turnos.length === 0 && medsConDiasLimitados.length === 0) {
    return <div className="py-10 text-center text-sm font-medium text-subtle">No tenés turnos agendados próximamente.</div>;
  }

  const porFecha = new Map<string, Turno[]>();
  for (const t of turnos) {
    if (!porFecha.has(t.fecha)) porFecha.set(t.fecha, []);
    porFecha.get(t.fecha)!.push(t);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="px-0.5 text-[11.5px] font-medium text-subtle">Turnos agendados próximamente.</div>
      {[...porFecha.entries()].map(([fecha, items]) => (
        <div key={fecha}>
          <div className="eyebrow px-0.5 pb-[9px] text-subtle">
            {formatoFechaCorta(fecha)}
          </div>
          <div className="flex flex-col gap-2">
            {items.map((t) => {
              const { dia, mes } = diaYMes(t.fecha);
              return (
                <div
                  key={t.id}
                  className="flex items-center gap-3 rounded-[var(--radius-item)] bg-card p-3 shadow-item"
                >
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-[13px] bg-persona-1-tint text-persona-1">
                    <VitaIcon name={iconoDeEspecialidad(t.especialidad)} size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-heading text-[14.5px] font-extrabold tracking-[-0.02em]">{t.especialidad}</div>
                    <div className="mt-0.5 truncate text-[11.5px] font-medium text-subtle">
                      {[t.profesional, `${dia} ${mes}`, `${t.hora} hs`].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {medsConDiasLimitados.length > 0 && (
        <div>
          <div className="eyebrow px-0.5 pb-[9px] text-subtle">
            Medicamentos de días puntuales
          </div>
          <div className="flex flex-col gap-2">
            {medsConDiasLimitados.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-3 rounded-[var(--radius-item)] bg-card p-3 shadow-item"
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-[13px] bg-persona-1-tint text-persona-1">
                  <VitaIcon name="pill" size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-heading text-[14.5px] font-extrabold tracking-[-0.02em]">{m.nombre}</div>
                  <div className="mt-0.5 truncate text-[11.5px] font-medium text-subtle">
                    {[m.dosis, `${m.hora_programada} hs`, ETIQUETA_MOMENTO_CORTA[m.momento_dia]].filter(Boolean).join(" · ")}
                  </div>
                  <div className="mt-1 flex gap-1">
                    {m.dias_recurrentes.map((d) => (
                      <span key={d} className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-bold text-slate-brand">
                        {ETIQUETA_DIA_CORTA[d] ?? d}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
