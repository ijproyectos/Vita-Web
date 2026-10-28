"use client";

import { useState, useTransition } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { VitaIcon } from "@/lib/vita-icons";
import { cn } from "@/lib/utils";
import { ProgressRing } from "@/components/vita/progress-ring";
import { EncabezadoPerfil } from "@/components/vita/encabezado-perfil";
import { CheckToggle } from "./check-toggle";
import { MarcarTodosButton } from "./marcar-todos-button";
import { AgregarSheet } from "./agregar-sheet";
import { DetalleMedicamento, type StockDetalle } from "./detalle-medicamento";
import { DetalleTurno } from "./detalle-turno";
import { HistorialView, type MedicionDia } from "./historial-view";
import { ProximosView } from "./proximos-view";
import { marcarTomadoAction } from "./actions";
import { ORDEN_MOMENTOS, ETIQUETA_MOMENTO, RANGO_MOMENTO, momentoDelDia } from "@/lib/rutina/momento";
import { formatoFechaCorta, fechaDeHoyISO } from "@/lib/rutina/formato";
import { iconoDeEspecialidad } from "@/lib/turnos/icono";
import { claveMedicamento } from "@/lib/inventario/tipos";
import { colorChipPorIndice } from "@/lib/perfil/tipos";
import { indicacionDeComida, textoDosis, type Medicamento, type MedicamentoConToma, type ResumenAdherencia, type TomaRegistrada } from "@/lib/medicamentos/tipos";
import type { Turno } from "@/lib/turnos/tipos";
import type { Receta } from "@/lib/recetas/nucleo";
import type { OpcionPerfil, PerfilActivo } from "@/lib/familia/tipos";

const ICONO_MOMENTO = { "mañana": "sunrise", mediodia: "sun", tarde: "sunset", noche: "moon" } as const;

const TINTE = {
  teal: "bg-chip-teal-bg text-chip-teal-ink",
  violet: "bg-chip-violet-bg text-chip-violet-ink",
  amber: "bg-chip-amber-bg text-chip-amber-ink",
  rose: "bg-chip-rose-bg text-chip-rose-ink",
} as const;

const SOLIDO = {
  teal: "bg-chip-teal-ink",
  violet: "bg-chip-violet-ink",
  amber: "bg-chip-amber-ink",
  rose: "bg-chip-rose-ink",
} as const;

type Vista = "hoy" | "proximos" | "historial";
const PESTANAS: { clave: Vista; etiqueta: string }[] = [
  { clave: "hoy", etiqueta: "Hoy" },
  { clave: "proximos", etiqueta: "Próximos" },
  { clave: "historial", etiqueta: "Historial" },
];

export function RutinaView({
  medsHoy,
  todosLosMeds,
  turnosHoy,
  turnosProximos,
  adherencia,
  stockPorMedicamento,
  tomas,
  medicionesDia,
  recetas,
  hoy,
  perfil,
  opciones,
}: {
  medsHoy: MedicamentoConToma[];
  todosLosMeds: Medicamento[];
  turnosHoy: Turno[];
  turnosProximos: Turno[];
  adherencia: ResumenAdherencia;
  stockPorMedicamento: Record<string, StockDetalle>;
  tomas: TomaRegistrada[];
  medicionesDia: MedicionDia[];
  recetas: Receta[];
  hoy: string;
  perfil: PerfilActivo;
  opciones: OpcionPerfil[];
}) {
  const puedeEditar = perfil.rol === "editar";
  const router = useRouter();
  const searchParams = useSearchParams();
  const param = searchParams.get("vista");
  const vista: Vista = param === "proximos" ? "proximos" : param === "historial" ? "historial" : "hoy";
  const [showAdd, setShowAdd] = useState(false);
  const [medAbiertoId, setMedAbiertoId] = useState<string | null>(null);
  const [turnoAbierto, setTurnoAbierto] = useState<Turno | null>(null);
  const [pendiente, startTransition] = useTransition();
  // Estado optimista de las tomas: la fila y la hoja de detalle comparten la misma verdad.
  const [tomadoLocal, setTomadoLocal] = useState<Record<string, boolean>>({});
  const tomadoDe = (m: MedicamentoConToma) => tomadoLocal[m.id] ?? m.tomado;

  const tomados = medsHoy.filter(tomadoDe).length;
  const total = medsHoy.length;
  const pct = total === 0 ? 0 : Math.round((tomados / total) * 100);

  function cambiarVista(v: Vista) {
    router.push(v === "hoy" ? "/app/rutina" : `/app/rutina?vista=${v}`, { scroll: false });
  }

  function alternar(med: MedicamentoConToma) {
    const nuevo = !tomadoDe(med);
    setTomadoLocal((prev) => ({ ...prev, [med.id]: nuevo }));
    startTransition(async () => {
      try {
        const r = await marcarTomadoAction(med.id, nuevo);
        if (r.status === "error") {
          setTomadoLocal((prev) => ({ ...prev, [med.id]: !nuevo }));
          toast.error(r.message);
          return;
        }
        router.refresh();
      } catch {
        setTomadoLocal((prev) => ({ ...prev, [med.id]: !nuevo }));
        toast.error("No se pudo registrar la toma.");
      }
    });
  }

  // Medicamento abierto: puede venir de "Hoy" (con toma) o de Próximos (días puntuales).
  const medAbierto = medAbiertoId ? (medsHoy.find((m) => m.id === medAbiertoId) ?? todosLosMeds.find((m) => m.id === medAbiertoId) ?? null) : null;
  const medAbiertoHoy = medAbierto ? medsHoy.find((m) => m.id === medAbierto.id) ?? null : null;
  const hermanos = medAbierto
    ? todosLosMeds.filter((m) => claveMedicamento(m.nombre, m.dosis) === claveMedicamento(medAbierto.nombre, medAbierto.dosis))
    : [];
  const indiceColor = medAbierto ? Math.max(0, medsHoy.findIndex((m) => m.id === medAbierto.id)) : 0;

  return (
    <div className="flex flex-col gap-[18px] px-[18px] pt-1.5">
      <EncabezadoPerfil
        perfil={perfil}
        opciones={opciones}
        eyebrowSelector="Rutina de"
        estatico={{ eyebrow: "Tu día de salud", titulo: "Mi Rutina" }}
        pie={!puedeEditar ? <div className="mt-1 text-[12px] font-semibold text-subtle">Solo ver: no podés cambiar nada.</div> : undefined}
        accion={
          puedeEditar ? (
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              aria-label="Agregar a la rutina"
              className="flex size-[42px] shrink-0 items-center justify-center rounded-full bg-card shadow-card transition-transform active:scale-[0.94] motion-reduce:transition-none"
            >
              <VitaIcon name="plus" size={20} />
            </button>
          ) : undefined
        }
      />

      <div role="tablist" aria-label="Vista de la rutina" className="flex rounded-full bg-secondary p-1">
        {PESTANAS.map((p) => (
          <button
            key={p.clave}
            type="button"
            role="tab"
            aria-selected={vista === p.clave}
            onClick={() => cambiarVista(p.clave)}
            className={cn(
              "flex-1 rounded-full px-3 py-2.5 text-[13px] font-bold tracking-[-0.01em] transition-all motion-reduce:transition-none",
              vista === p.clave ? "bg-card text-teal-deep shadow-item" : "text-subtle"
            )}
          >
            {p.etiqueta}
          </button>
        ))}
      </div>

      {vista === "hoy" && (
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
                  <VitaIcon name="flame" size={12} /> {perfil.esPropio ? "Llevás" : "Lleva"} {adherencia.rachaDias}{" "}
                  {adherencia.rachaDias === 1 ? "día" : "días"} sin saltarte ninguno
                </div>
              )}
            </div>
            <ProgressRing pct={pct} size={74} tono="card" />
          </div>

          {puedeEditar && tomados < total && <MarcarTodosButton />}

          <TimelineHoy
            medsHoy={medsHoy}
            turnosHoy={turnosHoy}
            tomadoDe={tomadoDe}
            pendiente={pendiente}
            puedeEditar={puedeEditar}
            onAlternar={alternar}
            onAbrirMed={(m) => setMedAbiertoId(m.id)}
            onAbrirTurno={setTurnoAbierto}
            onAgregar={() => setShowAdd(true)}
          />
        </>
      )}

      {vista === "proximos" && (
        <ProximosView
          turnos={turnosProximos}
          recetas={recetas}
          todosLosMeds={todosLosMeds}
          onAbrirTurno={setTurnoAbierto}
          onAbrirMedicamento={(m) => setMedAbiertoId(m.id)}
        />
      )}

      {vista === "historial" && (
        <HistorialView meds={todosLosMeds} tomas={tomas} mediciones={medicionesDia} hoy={hoy} puedeEditar={puedeEditar} />
      )}

      {puedeEditar && (
        <AgregarSheet open={showAdd} onOpenChange={setShowAdd} nombrePersona={perfil.esPropio ? null : perfil.nombre.split(" ")[0]} />
      )}

      <DetalleMedicamento
        med={medAbierto}
        hermanos={hermanos}
        tomas={tomas}
        hoy={hoy}
        stock={medAbierto ? (stockPorMedicamento[medAbierto.id] ?? null) : null}
        tomado={medAbiertoHoy ? tomadoDe(medAbiertoHoy) : false}
        color={colorChipPorIndice(indiceColor)}
        perfil={perfil}
        puedeEditar={puedeEditar && medAbiertoHoy !== null}
        pendiente={pendiente}
        onAlternar={() => medAbiertoHoy && alternar(medAbiertoHoy)}
        onCerrar={() => setMedAbiertoId(null)}
      />

      {turnoAbierto && (
        <DetalleTurno key={turnoAbierto.id} turno={turnoAbierto} perfil={perfil} puedeEditar={puedeEditar} onCerrar={() => setTurnoAbierto(null)} />
      )}
    </div>
  );
}

function TimelineHoy({
  medsHoy,
  turnosHoy,
  tomadoDe,
  pendiente,
  puedeEditar,
  onAlternar,
  onAbrirMed,
  onAbrirTurno,
  onAgregar,
}: {
  medsHoy: MedicamentoConToma[];
  turnosHoy: Turno[];
  tomadoDe: (m: MedicamentoConToma) => boolean;
  pendiente: boolean;
  puedeEditar: boolean;
  onAlternar: (m: MedicamentoConToma) => void;
  onAbrirMed: (m: MedicamentoConToma) => void;
  onAbrirTurno: (t: Turno) => void;
  onAgregar: () => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      {ORDEN_MOMENTOS.map((momento) => {
        const meds = medsHoy.filter((m) => m.momento_dia === momento).sort((a, b) => a.hora_programada.localeCompare(b.hora_programada));
        const turnos = turnosHoy.filter((t) => momentoDelDia(t.hora) === momento).sort((a, b) => a.hora.localeCompare(b.hora));
        const total = meds.length + turnos.length;
        // Medicamentos y turnos juntos, por hora (a igual hora, el medicamento primero).
        const items = [
          ...meds.map((med, indice) => ({ tipo: "med" as const, hora: med.hora_programada.slice(0, 5), med, indice })),
          ...turnos.map((turno) => ({ tipo: "turno" as const, hora: turno.hora.slice(0, 5), turno })),
        ].sort((a, b) => a.hora.localeCompare(b.hora) || (a.tipo === b.tipo ? 0 : a.tipo === "med" ? -1 : 1));

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
              {puedeEditar && (
                <button type="button" onClick={onAgregar} className="text-[12.5px] font-bold text-teal-deep">
                  + Agregar
                </button>
              )}
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
              {items.map((it) =>
                it.tipo === "med" ? (
                  <MedItem
                    key={it.med.id}
                    med={it.med}
                    color={colorChipPorIndice(it.indice)}
                    tomado={tomadoDe(it.med)}
                    pendiente={pendiente}
                    puedeEditar={puedeEditar}
                    onAlternar={() => onAlternar(it.med)}
                    onAbrir={() => onAbrirMed(it.med)}
                  />
                ) : (
                  <AptItem key={it.turno.id} turno={it.turno} onAbrir={() => onAbrirTurno(it.turno)} />
                )
              )}
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
  tomado,
  pendiente,
  puedeEditar,
  onAlternar,
  onAbrir,
}: {
  med: MedicamentoConToma;
  color: ReturnType<typeof colorChipPorIndice>;
  tomado: boolean;
  pendiente: boolean;
  puedeEditar: boolean;
  onAlternar: () => void;
  onAbrir: () => void;
}) {
  const dosis = textoDosis(med);
  return (
    <div className="relative">
      <span
        className={cn(
          "absolute -left-[15px] top-6 size-2.5 rounded-full",
          tomado ? cn(SOLIDO[color], "shadow-[0_0_0_3px_var(--canvas)]") : "bg-card ring-2 ring-border"
        )}
      />
      <div
        role="button"
        tabIndex={0}
        onClick={onAbrir}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onAbrir();
          }
        }}
        aria-label={`${med.nombre}, ver detalle`}
        className="flex cursor-pointer items-center gap-3 rounded-[var(--radius-item)] bg-card p-3 shadow-item"
      >
        <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-[13px]", TINTE[color])}>
          <VitaIcon name="pill" size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className={cn("truncate font-heading text-[14.5px] font-extrabold tracking-[-0.02em]", tomado && "line-through opacity-55")}>{med.nombre}</div>
          <div className={cn("mt-0.5 truncate text-[11.5px] font-medium text-subtle", tomado && "opacity-60")}>
            {dosis ? `${dosis} · ` : ""}
            {med.hora_programada.slice(0, 5)} hs
            {indicacionDeComida(med) ? ` · ${indicacionDeComida(med)}` : ""}
          </div>
        </div>
        {puedeEditar ? (
          <CheckToggle tomado={tomado} pendiente={pendiente} onAlternar={onAlternar} />
        ) : (
          tomado && (
            <span className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground" aria-label="Tomado">
              <VitaIcon name="check" size={16} strokeWidth={3} />
            </span>
          )
        )}
      </div>
    </div>
  );
}

function AptItem({ turno, onAbrir }: { turno: Turno; onAbrir: () => void }) {
  return (
    <div className="relative">
      <span className="absolute -left-[15px] top-6 size-2.5 rounded-full bg-primary" />
      <button
        type="button"
        onClick={onAbrir}
        className="flex w-full items-center gap-3 rounded-[var(--radius-item)] bg-card p-3 text-left shadow-item"
      >
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
      </button>
    </div>
  );
}
