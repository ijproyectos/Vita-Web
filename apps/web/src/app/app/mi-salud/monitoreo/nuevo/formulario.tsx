"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useVolver } from "@/lib/navegacion/rastreador";
import { VitaIcon } from "@/lib/vita-icons";
import { SelectorHora } from "@/components/vita/selector-hora";
import { FilaCuando, HojaCuando } from "@/components/vita/campos-medicamento";
import { CUANDO_INICIAL, fechaFinDe, fechaHoyAR, type CuandoForm } from "@/lib/medicamentos/cuando";
import { relacionDeToma } from "@/lib/medicamentos/comidas";
import { siguienteHora } from "@/lib/medicamentos/forma";
import { MAX_HORARIOS_PLAN, fraseMedir, type HorarioPlan, type Monitoreo } from "@/lib/mediciones/plan";
import { MAX_NOMBRE_OTRA, MAX_UNIDAD_OTRA, TIPOS_PLAN, type TipoRegistrable } from "@/lib/mediciones/tipos";
import type { EstadoAccion } from "../../../rutina/actions";
import { guardarMonitoreoAction } from "../actions";
import { ChipsMetrica } from "../chips-metrica";

const ESTADO_INICIAL: EstadoAccion = { status: "idle" };
const HORARIO_INICIAL: HorarioPlan = { hora: "08:00", conComida: "no-importa", indicacion: null };
const CLASE_INPUT = "w-full rounded-full border border-foreground/10 bg-card px-4 py-3 text-sm font-semibold outline-none placeholder:text-faint focus-visible:ring-2 focus-visible:ring-primary/40";

export function FormularioMonitoreo({
  tipoInicial,
  nombreInicial,
  existente,
  volver,
}: {
  tipoInicial: TipoRegistrable;
  nombreInicial: string;
  existente: Monitoreo | null;
  volver: string;
}) {
  const router = useRouter();
  const volverAtras = useVolver(volver);
  const [tipo, setTipo] = useState<TipoRegistrable>(tipoInicial);
  const [nombre, setNombre] = useState(existente?.nombre_otra ?? nombreInicial);
  const [unidad, setUnidad] = useState(existente?.unidad_otra ?? "");
  const [horarios, setHorarios] = useState<HorarioPlan[]>(existente?.horarios ?? [HORARIO_INICIAL]);
  const [editando, setEditando] = useState<number | null>(null);
  const [cuando, setCuando] = useState<CuandoForm>(
    existente
      ? { dias: existente.dias_recurrentes, hasta: existente.fecha_fin ? "fecha" : "siempre", fechaElegida: existente.fecha_fin ?? "" }
      : CUANDO_INICIAL
  );
  const [hojaCuando, setHojaCuando] = useState(false);

  const esOtra = tipo === "otra";
  const horas = horarios.map((h) => h.hora);
  const repetidas = new Set(horas).size !== horas.length;
  const actual = editando !== null ? horarios[editando] : undefined;

  async function accion(prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
    const resultado = await guardarMonitoreoAction(prev, formData);
    if (resultado.status === "success") {
      toast.success(`Listo. vita te avisa para medir ${fraseMedir({ tipo, nombre_otra: nombre })}`);
      router.replace(volver);
    }
    return resultado;
  }
  const [estado, formAction, pendiente] = useActionState(accion, ESTADO_INICIAL);

  return (
    <form action={formAction} className="flex flex-col gap-[22px] pb-10">
      <input type="hidden" name="horarios" value={JSON.stringify(horarios)} />
      <input type="hidden" name="dias" value={JSON.stringify(cuando.dias)} />
      <input type="hidden" name="fechaFin" value={fechaFinDe(cuando, fechaHoyAR()) ?? ""} />

      <div>
        <Etiqueta text="Qué medir" />
        {/* Al editar la métrica queda fija: para medir otra cosa se crea un monitoreo nuevo. */}
        <ChipsMetrica tipos={existente ? TIPOS_PLAN.filter((t) => t === tipo) : TIPOS_PLAN} valor={tipo} onElegir={setTipo} />
        <input type="hidden" name="tipo" value={tipo} />
        {esOtra && (
          <div className="mt-2.5 grid grid-cols-[minmax(0,1fr)_110px] gap-2.5">
            <input name="nombreOtra" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={MAX_NOMBRE_OTRA} placeholder="¿Qué medís?" aria-label="Qué medís" className={CLASE_INPUT} />
            <input name="unidadOtra" value={unidad} onChange={(e) => setUnidad(e.target.value)} maxLength={MAX_UNIDAD_OTRA} placeholder="Unidad" aria-label="Unidad" className={CLASE_INPUT} />
          </div>
        )}
      </div>

      <div>
        <Etiqueta text="Horarios" />
        <div className="flex flex-col gap-[9px]">
          {horarios.map((h, i) => {
            const relacion = relacionDeToma(h);
            return (
              <div key={i} className="flex items-center gap-3 rounded-[var(--radius-item)] bg-card px-[18px] py-[15px] shadow-item">
                <button type="button" onClick={() => setEditando(i)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <VitaIcon name="clock" size={17} className="shrink-0 text-subtle" />
                  <span className="min-w-0 flex-1">
                    <span className="eyebrow block text-subtle">{`${i + 1}.ª medición`}</span>
                    <span className={`mt-[3px] block text-[13px] font-bold ${relacion ? "text-teal-deep" : "text-faint"}`}>
                      {relacion ?? "Elegí si va con alguna comida"}
                    </span>
                  </span>
                  <span className="font-heading text-base font-extrabold tabular-nums tracking-[-0.02em]">{h.hora}</span>
                </button>
                {horarios.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setHorarios(horarios.filter((_, k) => k !== i))}
                    aria-label={`Quitar la medición de las ${h.hora}`}
                    className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-secondary text-subtle active:scale-[0.92] motion-reduce:transform-none"
                  >
                    <VitaIcon name="close" size={12} strokeWidth={3} />
                  </button>
                )}
              </div>
            );
          })}
          {horarios.length < MAX_HORARIOS_PLAN && (
            <button
              type="button"
              onClick={() => setHorarios([...horarios, { ...HORARIO_INICIAL, hora: siguienteHora(horas) }])}
              className="flex items-center justify-center gap-[7px] rounded-[var(--radius-item)] border-[1.5px] border-dashed border-primary/45 p-[13px] text-[13.5px] font-extrabold text-teal-deep active:scale-[0.98] motion-reduce:transform-none"
            >
              <VitaIcon name="plus" size={14} strokeWidth={2.8} />
              Agregar horario
            </button>
          )}
        </div>
        {repetidas && <p className="mt-2 pl-1 text-xs font-semibold text-destructive">Hay dos mediciones a la misma hora.</p>}
      </div>

      <FilaCuando cuando={cuando} onClick={() => setHojaCuando(true)} />

      <div className="flex items-start gap-[11px]">
        <div className="min-h-[34px] w-[3px] self-stretch rounded-[3px] bg-primary" />
        <p className="text-[12.5px] font-medium leading-normal text-slate-brand">vita te avisa a cada hora. Tocás el aviso y cargás el valor.</p>
      </div>

      {estado.status === "error" && (
        <p className="rounded-[14px] bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive" role="alert">
          {estado.message}
        </p>
      )}

      <div className="mt-1 flex gap-2.5">
        <button type="button" onClick={() => volverAtras()} className="rounded-full border border-foreground/10 px-[22px] py-4 font-heading text-sm font-bold text-slate-brand">
          Atrás
        </button>
        <button
          type="submit"
          disabled={pendiente || repetidas}
          className="flex-1 rounded-full bg-primary py-4 font-heading text-[14.5px] font-extrabold tracking-[-0.01em] text-primary-foreground shadow-cta-sm disabled:bg-secondary disabled:text-subtle disabled:shadow-none"
        >
          {pendiente ? "Guardando…" : "Guardar monitoreo"}
        </button>
      </div>

      <SelectorHora
        abierto={editando !== null}
        hora={actual?.hora ?? "08:00"}
        comida={{ conComida: actual?.conComida ?? "no-importa", indicacion: actual?.indicacion ?? null }}
        conComidas
        onCerrar={() => setEditando(null)}
        onConfirmar={(hora, comida) => {
          setHorarios(horarios.map((h, i) => (i === editando ? { hora, ...comida } : h)));
          setEditando(null);
        }}
      />
      <HojaCuando abierto={hojaCuando} valor={cuando} onCambio={setCuando} onCerrar={() => setHojaCuando(false)} titulo="¿Cuándo medís?" />
    </form>
  );
}

function Etiqueta({ text }: { text: string }) {
  return <div className="eyebrow mb-3.5 border-b border-foreground/[0.07] pb-2.5 text-subtle">{text}</div>;
}
