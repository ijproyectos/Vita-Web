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
import { diaYMes, formatoFechaCorta } from "@/lib/rutina/formato";
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
}: {
  medsHoy: MedicamentoConToma[];
  todosLosMeds: Medicamento[];
  turnosHoy: Turno[];
  turnosProximos: Turno[];
  adherencia: ResumenAdherencia;
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
    <div className="flex flex-col gap-4.5 px-4 pt-2">
      <div className="mt-1.5 flex items-center justify-between">
        <div>
          <div className="text-[12px] font-semibold uppercase tracking-wide text-primary">Tu día de salud</div>
          <div className="mt-0.5 font-heading text-[26px] font-extrabold tracking-tight">Rutina</div>
        </div>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          aria-label="Agregar"
          className="flex size-10 items-center justify-center rounded-full bg-card shadow-[var(--shadow-card,0_8px_24px_rgba(15,33,54,0.06))]"
        >
          <VitaIcon name="plus" size={20} />
        </button>
      </div>

      <div className="flex rounded-full bg-secondary p-1">
        {(["hoy", "proximos"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => cambiarVista(v)}
            className={
              "flex-1 rounded-full py-2.5 font-heading text-[13.5px] font-bold transition-all " +
              (vista === v ? "bg-card text-primary shadow-[0_2px_6px_rgba(15,33,54,0.06)]" : "text-muted-foreground")
            }
          >
            {v === "hoy" ? "Hoy" : "Próximos días"}
          </button>
        ))}
      </div>

      {vista === "hoy" ? (
        <>
          <div
            className="relative overflow-hidden rounded-[20px] p-4.5 text-white shadow-[0_14px_36px_rgba(8,145,178,0.28)]"
            style={{ background: "linear-gradient(135deg, #0891b2 0%, #0e7490 60%, #155e75 100%)" }}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[12.5px] font-semibold uppercase tracking-wide opacity-80">
                  Hoy · {formatoFechaCorta(new Date().toISOString().slice(0, 10))}
                </div>
                <div className="mt-1 font-heading text-[22px] font-extrabold leading-tight">
                  {tomados}/{total} medicamentos
                </div>
                <div className="mt-1 text-[13px] opacity-88">
                  + {turnosHoy.length} turno{turnosHoy.length !== 1 ? "s" : ""} hoy
                </div>
                {adherencia.rachaDias > 0 && (
                  <div className="mt-1.5 flex items-center gap-1 text-[12.5px] opacity-82">
                    <VitaIcon name="flame" size={12} /> Llevás {adherencia.rachaDias}{" "}
                    {adherencia.rachaDias === 1 ? "día" : "días"} sin saltarte ninguno
                  </div>
                )}
              </div>
              <ProgressRing pct={pct} />
            </div>
          </div>

          {tomados < total && <MarcarTodosButton />}

          <TimelineHoy medsHoy={medsHoy} turnosHoy={turnosHoy} onAgregar={() => setShowAdd(true)} />
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
  onAgregar,
}: {
  medsHoy: MedicamentoConToma[];
  turnosHoy: Turno[];
  onAgregar: () => void;
}) {
  return (
    <div className="flex flex-col gap-4.5">
      {ORDEN_MOMENTOS.map((momento) => {
        const meds = medsHoy.filter((m) => m.momento_dia === momento).sort((a, b) => a.hora_programada.localeCompare(b.hora_programada));
        const turnos = turnosHoy
          .filter((t) => momentoDelDia(t.hora) === momento)
          .sort((a, b) => a.hora.localeCompare(b.hora));
        const total = meds.length + turnos.length;

        if (total === 0) {
          return (
            <div key={momento} className="flex items-center gap-2.5">
              <div className="flex size-8 items-center justify-center rounded-[10px] bg-secondary text-muted-foreground/60">
                <VitaIcon name={ICONO_MOMENTO[momento]} size={17} />
              </div>
              <div className="flex-1">
                <div className="font-heading text-[15px] font-bold text-muted-foreground">{ETIQUETA_MOMENTO[momento]}</div>
                <div className="text-[11px] text-muted-foreground">{RANGO_MOMENTO[momento]} hs · sin items</div>
              </div>
              <button type="button" onClick={onAgregar} className="text-[13px] font-semibold text-primary">
                + Agregar
              </button>
            </div>
          );
        }

        return (
          <div key={momento}>
            <div className="flex items-center gap-2.5 pb-2.5">
              <div className="flex size-8 items-center justify-center rounded-[10px] bg-secondary text-muted-foreground">
                <VitaIcon name={ICONO_MOMENTO[momento]} size={17} />
              </div>
              <div className="flex-1">
                <div className="font-heading text-[15px] font-bold">{ETIQUETA_MOMENTO[momento]}</div>
                <div className="text-[11px] text-muted-foreground">
                  {RANGO_MOMENTO[momento]} hs · {total} item{total !== 1 ? "s" : ""}
                </div>
              </div>
            </div>
            <div className="relative flex flex-col gap-2 pl-3.5">
              <div className="absolute inset-y-2.5 left-1 w-0.5 rounded-full bg-secondary" />
              {meds.map((m, i) => (
                <MedItem key={m.id} med={m} color={colorChipPorIndice(i)} />
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

function MedItem({ med, color }: { med: MedicamentoConToma; color: ReturnType<typeof colorChipPorIndice> }) {
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
          "absolute -left-[15px] top-[22px] size-2.5 rounded-full ring-2 ring-border " +
          (med.tomado ? "bg-primary" : "bg-card")
        }
      />
      <div className="flex items-center gap-3 rounded-[20px] bg-card p-3 shadow-[var(--shadow-card,0_8px_24px_rgba(15,33,54,0.06))]">
        <div className={`flex size-10 shrink-0 items-center justify-center rounded-full ${TINTE_BG[color]}`}>
          <VitaIcon name="pill" size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className={"truncate font-heading text-[14.5px] font-bold " + (med.tomado ? "opacity-55 line-through" : "")}>
            {med.nombre}
          </div>
          <div className={"text-xs text-muted-foreground " + (med.tomado ? "opacity-60" : "")}>
            {med.dosis ? `${med.dosis} · ` : ""}
            {med.hora_programada} hs
          </div>
        </div>
        <div className="flex flex-col items-center gap-1">
          <CheckToggle medicamentoId={med.id} tomadoInicial={med.tomado} />
          <EliminarMedButton medicamentoId={med.id} nombre={med.nombre} />
        </div>
      </div>
    </div>
  );
}

function AptItem({ turno }: { turno: Turno }) {
  return (
    <div className="relative">
      <span className="absolute -left-[15px] top-[22px] size-2.5 rounded-full bg-primary/60 ring-4 ring-primary/15" />
      <div className="relative flex items-center gap-3 rounded-[20px] bg-card py-3 pl-4 pr-3 shadow-[var(--shadow-card,0_8px_24px_rgba(15,33,54,0.06))]">
        <span className="absolute inset-y-3.5 left-1.5 w-[3px] rounded-full bg-primary" />
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#ecfeff] text-[#155e75]">
          <VitaIcon name="stethoscope" size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <div className="truncate font-heading text-[14.5px] font-bold">{turno.especialidad}</div>
            <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
              turno
            </span>
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {[turno.profesional, `${turno.hora} hs`].filter(Boolean).join(" · ")}
          </div>
          {turno.lugar && <div className="mt-0.5 truncate text-[11px] text-muted-foreground opacity-80">{turno.lugar}</div>}
        </div>
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
    return <div className="py-10 text-center text-sm text-muted-foreground">No tenés turnos agendados próximamente.</div>;
  }

  const porFecha = new Map<string, Turno[]>();
  for (const t of turnos) {
    if (!porFecha.has(t.fecha)) porFecha.set(t.fecha, []);
    porFecha.get(t.fecha)!.push(t);
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div className="px-0.5 text-xs text-muted-foreground">Turnos agendados próximamente.</div>
      {[...porFecha.entries()].map(([fecha, items]) => (
        <div key={fecha}>
          <div className="px-0.5 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {formatoFechaCorta(fecha)}
          </div>
          <div className="flex flex-col gap-2">
            {items.map((t) => {
              const { dia, mes } = diaYMes(t.fecha);
              return (
                <div
                  key={t.id}
                  className="flex items-center gap-3 rounded-[20px] bg-card p-3 shadow-[var(--shadow-card,0_8px_24px_rgba(15,33,54,0.06))]"
                >
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#ecfeff] text-[#155e75]">
                    <VitaIcon name="stethoscope" size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-heading text-[14.5px] font-bold">{t.especialidad}</div>
                    <div className="truncate text-xs text-muted-foreground">
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
          <div className="px-0.5 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Medicamentos de días puntuales
          </div>
          <div className="flex flex-col gap-2">
            {medsConDiasLimitados.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-3 rounded-[20px] bg-card p-3 shadow-[var(--shadow-card,0_8px_24px_rgba(15,33,54,0.06))]"
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-chip-teal-bg text-chip-teal-ink">
                  <VitaIcon name="pill" size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-heading text-[14.5px] font-bold">{m.nombre}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {[m.dosis, `${m.hora_programada} hs`, ETIQUETA_MOMENTO_CORTA[m.momento_dia]].filter(Boolean).join(" · ")}
                  </div>
                  <div className="mt-1 flex gap-1">
                    {m.dias_recurrentes.map((d) => (
                      <span key={d} className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
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
