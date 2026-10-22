"use client";

import { cn } from "@/lib/utils";
import { VitaIcon } from "@/lib/vita-icons";
import { diaYMes, etiquetaDia, formatoFechaCorta } from "@/lib/rutina/formato";
import { iconoDeEspecialidad } from "@/lib/turnos/icono";
import type { Turno } from "@/lib/turnos/tipos";
import type { Medicamento } from "@/lib/medicamentos/tipos";
import type { Receta } from "@/lib/recetas/nucleo";

// Rutina → Próximos (V7 "isRutinaProximos"): turnos agendados y cambios en la
// medicación (recetas por retirar), agrupados por día. Tocar un turno abre su
// hoja de detalle; tocar una receta abre la del medicamento si existe.

const ETIQUETA_DIA_CORTA: Record<string, string> = {
  lunes: "Lu",
  martes: "Ma",
  miercoles: "Mi",
  jueves: "Ju",
  viernes: "Vi",
  sabado: "Sa",
  domingo: "Do",
};

function Fila({
  icono,
  tile,
  titulo,
  sub,
  onAbrir,
}: {
  icono: string;
  tile: string;
  titulo: string;
  sub: string;
  onAbrir: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onAbrir}
      className="flex w-full items-center gap-3 rounded-[var(--radius-item)] bg-card p-[13px] text-left shadow-item transition-transform active:scale-[0.99] motion-reduce:transition-none"
    >
      <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-[13px]", tile)}>
        <VitaIcon name={icono} size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-heading text-[14.5px] font-extrabold tracking-[-0.02em]">{titulo}</div>
        <div className="mt-0.5 truncate text-[11.5px] font-medium text-subtle">{sub}</div>
      </div>
      <VitaIcon name="chevron-right" size={17} className="shrink-0 text-faint" />
    </button>
  );
}

export function ProximosView({
  turnos,
  recetas,
  todosLosMeds,
  onAbrirTurno,
  onAbrirMedicamento,
}: {
  turnos: Turno[];
  recetas: Receta[];
  todosLosMeds: Medicamento[];
  onAbrirTurno: (t: Turno) => void;
  onAbrirMedicamento: (m: Medicamento) => void;
}) {
  // Meds con dias_recurrentes puntuales (no todos los días) son invisibles en
  // "Hoy" cualquier día que no les toque; esta lista los muestra siempre.
  const medsConDiasLimitados = todosLosMeds.filter((m) => m.dias_recurrentes.length > 0);

  const porFecha = new Map<string, { turnos: Turno[]; recetas: Receta[] }>();
  const dia = (f: string) => {
    if (!porFecha.has(f)) porFecha.set(f, { turnos: [], recetas: [] });
    return porFecha.get(f)!;
  };
  for (const t of turnos) dia(t.fecha).turnos.push(t);
  for (const r of recetas) dia(r.fecha).recetas.push(r);
  const fechas = [...porFecha.keys()].sort();

  if (fechas.length === 0 && medsConDiasLimitados.length === 0) {
    return <div className="py-10 text-center text-sm font-medium text-subtle">No tenés turnos agendados próximamente.</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="px-0.5 text-[11.5px] font-medium text-subtle">Turnos agendados y cambios en tu medicación.</div>
      {fechas.map((fecha) => {
        const { turnos: ts, recetas: rs } = porFecha.get(fecha)!;
        const etiqueta = etiquetaDia(fecha);
        return (
          <div key={fecha}>
            <div className="eyebrow px-0.5 pb-[9px] text-subtle">
              {etiqueta === "Hoy" || etiqueta === "Mañana" ? `${etiqueta} · ${formatoFechaCorta(fecha)}` : formatoFechaCorta(fecha)}
            </div>
            <div className="flex flex-col gap-2">
              {ts
                .sort((a, b) => a.hora.localeCompare(b.hora))
                .map((t) => {
                  const { dia: d, mes } = diaYMes(t.fecha);
                  return (
                    <Fila
                      key={t.id}
                      icono={iconoDeEspecialidad(t.especialidad)}
                      tile="bg-persona-1-tint text-persona-1"
                      titulo={t.especialidad}
                      sub={[t.motivo?.trim() || t.profesional?.trim() || t.lugar?.trim(), `${t.hora} hs`].filter(Boolean).join(" · ") || `${d} ${mes}`}
                      onAbrir={() => onAbrirTurno(t)}
                    />
                  );
                })}
              {rs.map((r) => {
                const med = todosLosMeds.find((m) => m.nombre.trim().toLowerCase() === r.nombre.trim().toLowerCase());
                return (
                  <Fila
                    key={r.id}
                    icono="pill"
                    tile="bg-aviso-tint text-aviso-ink"
                    titulo="Nueva receta"
                    sub={`${r.nombre} — ${r.detalle?.trim() || "retirar en farmacia"}`}
                    onAbrir={() => med && onAbrirMedicamento(med)}
                  />
                );
              })}
            </div>
          </div>
        );
      })}

      {medsConDiasLimitados.length > 0 && (
        <div>
          <div className="eyebrow px-0.5 pb-[9px] text-subtle">Medicamentos de días puntuales</div>
          <div className="flex flex-col gap-2">
            {medsConDiasLimitados.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onAbrirMedicamento(m)}
                className="flex w-full items-center gap-3 rounded-[var(--radius-item)] bg-card p-3 text-left shadow-item"
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-[13px] bg-persona-1-tint text-persona-1">
                  <VitaIcon name="pill" size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-heading text-[14.5px] font-extrabold tracking-[-0.02em]">{m.nombre}</div>
                  <div className="mt-0.5 truncate text-[11.5px] font-medium text-subtle">
                    {[m.dosis, `${m.hora_programada.slice(0, 5)} hs`].filter(Boolean).join(" · ")}
                  </div>
                  <div className="mt-1 flex gap-1">
                    {m.dias_recurrentes.map((d) => (
                      <span key={d} className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-bold text-slate-brand">
                        {ETIQUETA_DIA_CORTA[d] ?? d}
                      </span>
                    ))}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
