"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { VitaIcon } from "@/lib/vita-icons";
import { cn } from "@/lib/utils";
import { fechaISOEnAR } from "@/lib/rutina/formato";
import { semanaDeMedicamento } from "@/lib/rutina/historial";
import { indicacionDeComida, textoDosis, type Medicamento, type TomaRegistrada } from "@/lib/medicamentos/tipos";
import type { ColorChip } from "@/lib/perfil/tipos";
import type { PerfilActivo } from "@/lib/familia/tipos";
import { eliminarMedicamentoAction } from "./actions";
import { CLASE_BOTON_SECUNDARIO, Dato, Hoja, SeccionHoja } from "./hoja";

// Hoja "Detalle medicamento" (V7 D:2832): horarios del día, stock, estado de
// hoy, desde cuándo, indicación, últimos 7 días y las acciones. "Indicado por"
// solo aparece si el medicamento lo tiene cargado (migración 023).

export type StockDetalle = { stock: number; umbral: number; dias: number | null };

const TONOS: Record<ColorChip, { tile: string; ink: string; solido: string; texto: string }> = {
  teal: { tile: "bg-chip-teal-bg text-chip-teal-ink", ink: "text-chip-teal-ink", solido: "bg-chip-teal-ink", texto: "text-chip-teal-ink" },
  violet: { tile: "bg-chip-violet-bg text-chip-violet-ink", ink: "text-chip-violet-ink", solido: "bg-chip-violet-ink", texto: "text-chip-violet-ink" },
  amber: { tile: "bg-chip-amber-bg text-chip-amber-ink", ink: "text-chip-amber-ink", solido: "bg-chip-amber-ink", texto: "text-chip-amber-ink" },
  rose: { tile: "bg-chip-rose-bg text-chip-rose-ink", ink: "text-chip-rose-ink", solido: "bg-chip-rose-ink", texto: "text-chip-rose-ink" },
};

const MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

// "Mar 2024": fecha_inicio si está cargada; si no, el día de alta en hora AR.
function desde(med: Medicamento): string {
  const iso = med.fecha_inicio ?? (isNaN(new Date(med.created_at).getTime()) ? "" : fechaISOEnAR(new Date(med.created_at)));
  const [anio, mes] = iso.split("-");
  const nombreMes = MESES_CORTOS[Number(mes) - 1];
  return nombreMes && anio ? `${nombreMes} ${anio}` : "—";
}

export function DetalleMedicamento({
  med,
  hermanos,
  tomas,
  hoy,
  stock,
  tomado,
  color,
  perfil,
  puedeEditar,
  pendiente,
  onAlternar,
  onEditar,
  onCerrar,
}: {
  med: Medicamento | null;
  hermanos: Medicamento[];
  tomas: TomaRegistrada[];
  hoy: string;
  stock: StockDetalle | null;
  tomado: boolean;
  color: ColorChip;
  perfil: PerfilActivo;
  puedeEditar: boolean;
  pendiente: boolean;
  onAlternar: () => void;
  /** Si se pasa, "Editar" lo llama en vez de navegar a la lista. */
  onEditar?: () => void;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const [eliminando, startEliminar] = useTransition();
  const [confirmando, setConfirmando] = useState(false);
  const tono = TONOS[color];

  // Mientras la hoja se cierra `med` ya es null: se conserva el último render
  // vacío en vez de mostrar datos a medias.
  if (!med) return <Hoja abierto={false} onCerrar={onCerrar} icono={null} tileClassName="" eyebrow="" eyebrowClassName="" titulo="">{null}</Hoja>;

  const horarios = hermanos.map((h) => h.hora_programada.slice(0, 5)).sort();
  const porDia = horarios.length;

  // Semana del grupo: un día está "ok" si todas las tomas esperadas se hicieron.
  // El día de hoy sigue el estado optimista (`tomado`), no el dato del servidor
  // que llega recién con el refresh.
  const hayHoy = tomas.some((t) => t.medicamento_id === med.id && t.fecha === hoy);
  const tomasVivas: TomaRegistrada[] = [
    ...tomas.filter((t) => !(t.medicamento_id === med.id && t.fecha === hoy)),
    ...(tomado || hayHoy ? [{ medicamento_id: med.id, fecha: hoy, tomado, tomado_en: null }] : []),
  ];
  const semanas = hermanos.map((h) => semanaDeMedicamento(h, tomasVivas, hoy));
  const semana = semanas[0].map((dia, i) => {
    const estados = semanas.map((s) => s[i].estado).filter((e) => e !== "no-aplica");
    const estado = estados.length === 0 ? "no-aplica" : estados.includes("miss") ? "miss" : estados.includes("pendiente") ? "pendiente" : "ok";
    return { ...dia, estado };
  });
  const completos = semana.filter((d) => d.estado === "ok").length;
  const aplicables = semana.filter((d) => d.estado !== "no-aplica").length;

  const stockBajo = stock ? stock.dias !== null && stock.dias <= 5 : false;
  const indicaciones = [indicacionDeComida(med), med.notas?.trim() || null].filter((x): x is string => Boolean(x));
  const eyebrow = perfil.esPropio ? "Tu medicamento" : `Medicamento de ${perfil.nombre.split(" ")[0]}`;

  function eliminar() {
    startEliminar(async () => {
      try {
        const r = await eliminarMedicamentoAction(med!.id);
        if (r.status === "error") {
          toast.error(r.message);
          return;
        }
        onCerrar();
        router.refresh();
      } catch {
        toast.error("No se pudo eliminar el medicamento.");
      }
    });
  }

  return (
    <Hoja
      abierto
      onCerrar={() => {
        setConfirmando(false);
        onCerrar();
      }}
      icono={<VitaIcon name="pill" size={26} />}
      tileClassName={tono.tile}
      eyebrow={eyebrow}
      eyebrowClassName={tono.ink}
      titulo={med.nombre}
      subtitulo={textoDosis(med) || undefined}
    >
      <div className="grid grid-cols-2 gap-2">
        <Dato label="Horario" valor={horarios.join(" · ")} sub={porDia === 1 ? "1 vez por día" : `${porDia} veces por día`} />
        <Dato
          label="Quedan"
          valor={stock ? `${stock.stock} comp.` : "—"}
          sub={
            !stock
              ? "Sin stock cargado"
              : stock.dias === null
                ? "Stock cargado"
                : stockBajo
                  ? `Alcanza ${stock.dias} ${stock.dias === 1 ? "día" : "días"} · comprar`
                  : `Alcanza ${stock.dias} días`
          }
          valorClassName={stockBajo ? "text-aviso-ink" : undefined}
        />
        <Dato
          label="Hoy"
          valor={tomado ? "Tomada" : "Pendiente"}
          sub={`Toma de las ${med.hora_programada.slice(0, 5)}`}
          valorClassName={tomado ? tono.ink : undefined}
        />
        <Dato label="Desde" valor={desde(med)} sub="En tratamiento" />
      </div>

      <SeccionHoja titulo="Indicación">
        <div className="overflow-hidden rounded-[20px] bg-card shadow-card">
          {(indicaciones.length ? indicaciones : ["Sin indicación cargada"]).map((t, i) => (
            <div key={t} className={cn("flex items-center gap-3 px-4 py-[13px]", i > 0 && "border-t border-foreground/[0.06]")}>
              <span className={cn("size-2 shrink-0 rounded-full", tono.solido)} />
              <span className="text-[13.5px] font-semibold leading-snug">{t}</span>
            </div>
          ))}
        </div>
      </SeccionHoja>

      <div className="flex flex-col gap-2.5 rounded-[20px] bg-card p-4 shadow-card">
        <div className="flex items-baseline justify-between">
          <div className="eyebrow text-subtle">Últimos 7 días</div>
          <div className="text-[12.5px] font-bold">
            {aplicables === 0 ? "Sin tomas esperadas" : `${completos} de ${aplicables} tomadas`}
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {semana.map((d) => (
            <div key={d.fecha} className="flex flex-col items-center gap-[5px]">
              <div
                className={cn(
                  "h-2 w-full rounded-full",
                  d.estado === "ok" ? tono.solido : d.estado === "miss" ? "bg-aviso/45" : "bg-border"
                )}
              />
              <div className="text-[10.5px] font-bold text-faint">{d.inicial}</div>
            </div>
          ))}
        </div>
      </div>

      {med.indicado_por?.trim() && <div className="px-1 text-[11.5px] font-medium text-subtle">Indicado por {med.indicado_por.trim()}</div>}

      {puedeEditar ? (
        <>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onAlternar}
              disabled={pendiente}
              className={cn(
                "flex-1 rounded-full py-3.5 text-sm font-extrabold transition-transform active:scale-[0.98] disabled:opacity-60 motion-reduce:transition-none",
                tomado ? "bg-card text-slate-brand shadow-item" : cn(tono.solido, "text-primary-foreground shadow-cta")
              )}
            >
              {tomado ? "Desmarcar toma" : "Marcar como tomada"}
            </button>
            {onEditar ? (
              <button type="button" onClick={onEditar} className={CLASE_BOTON_SECUNDARIO}>
                Editar
              </button>
            ) : (
              <Link href={`/app/medicamentos?editar=${med.id}`} className={CLASE_BOTON_SECUNDARIO}>
                Editar
              </Link>
            )}
          </div>
          {confirmando ? (
            <div className="flex items-center justify-between gap-3 rounded-[16px] bg-card px-4 py-3 shadow-item">
              <span className="text-[12.5px] font-medium leading-snug text-slate-brand">
                Se borra este horario y su historial de tomas.
              </span>
              <div className="flex shrink-0 gap-1.5">
                <button type="button" onClick={() => setConfirmando(false)} className="rounded-full px-3 py-2 text-[12.5px] font-bold text-slate-brand">
                  No
                </button>
                <button
                  type="button"
                  onClick={eliminar}
                  disabled={eliminando}
                  className="rounded-full bg-destructive px-3 py-2 text-[12.5px] font-extrabold text-primary-foreground disabled:opacity-60"
                >
                  {eliminando ? "Borrando…" : "Eliminar"}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmando(true)}
              className="self-center rounded-full px-4 py-2 text-[13px] font-bold text-destructive"
            >
              Eliminar este horario
            </button>
          )}
        </>
      ) : (
        <div className="px-1 text-center text-[12px] font-semibold text-subtle">Solo ver: no podés cambiar nada.</div>
      )}
    </Hoja>
  );
}
