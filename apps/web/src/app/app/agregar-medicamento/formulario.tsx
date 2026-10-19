"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { VitaIcon } from "@/lib/vita-icons";
import { cn } from "@/lib/utils";
import { crearMedicamentoAction, type EstadoAccion } from "../rutina/actions";
import type { ConComida, MomentoDia } from "@/lib/medicamentos/tipos";

const ESTADO_INICIAL: EstadoAccion = { status: "idle" };

const UNIDADES = ["mg", "ml", "gotas", "UI", "comp."];

const FRECUENCIAS = [
  "1 vez al día",
  "2 veces al día",
  "3 veces al día",
  "Cada 8 hs",
  "Cada 12 hs",
  "Según necesidad",
];

const MOMENTOS: { key: MomentoDia; label: string; hora: string; icon: string }[] = [
  { key: "mañana", label: "Mañana", hora: "08:00", icon: "sun" },
  { key: "mediodia", label: "Mediodía", hora: "13:00", icon: "sun" },
  { key: "tarde", label: "Tarde", hora: "18:00", icon: "sun" },
  { key: "noche", label: "Noche", hora: "22:00", icon: "moon" },
];

const COMIDAS: { v: ConComida; label: string }[] = [
  { v: "antes", label: "Antes" },
  { v: "con", label: "Con" },
  { v: "despues", label: "Después" },
  { v: "no-importa", label: "Cualquier momento" },
];

const DURACIONES = ["7 días", "14 días", "30 días", "Indefinido"];

export type InicialMedicamento = {
  nombre: string;
  dosis: string;
  unidad: string;
  /** Stock contado por foto en "Mis pastillas"; "" si no viene de ahí. */
  stockInicial: string;
  pastillasPorToma: string;
};

export function FormularioAgregarMedicamento({ inicial }: { inicial?: InicialMedicamento }) {
  const router = useRouter();
  const [nombre, setNombre] = useState(inicial?.nombre ?? "");
  const [dosis, setDosis] = useState(inicial?.dosis ?? "");
  const [unidad, setUnidad] = useState(inicial?.unidad && UNIDADES.includes(inicial.unidad) ? inicial.unidad : "mg");
  const [frecuencia, setFrecuencia] = useState(FRECUENCIAS[0]);
  const [momentos, setMomentos] = useState<MomentoDia[]>([]);
  const [conComida, setConComida] = useState<ConComida>("no-importa");
  const [duracion, setDuracion] = useState("Indefinido");
  const [notas, setNotas] = useState("");

  async function accion(prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
    const resultado = await crearMedicamentoAction(prev, formData);
    if (resultado.status === "success") {
      toast.success("Medicamento agregado");
      router.push("/app/rutina");
    }
    return resultado;
  }

  const [estado, formAction, pendiente] = useActionState(accion, ESTADO_INICIAL);
  const puedeGuardar = nombre.trim() && dosis.trim() && momentos.length > 0;

  function alternarMomento(m: MomentoDia) {
    setMomentos((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  }

  return (
    <form action={formAction} className="flex flex-col gap-[22px] pb-24">
      {inicial?.stockInicial && (
        <>
          <input type="hidden" name="stockInicial" value={inicial.stockInicial} />
          <input type="hidden" name="pastillasPorToma" value={inicial.pastillasPorToma} />
          <p className="rounded-[14px] bg-chip-teal-bg px-3.5 py-2.5 text-[13px] font-semibold text-chip-teal-ink">
            Se guardan también las {inicial.stockInicial} pastillas que contaste en el blister.
          </p>
        </>
      )}
      <Campo label="Nombre del medicamento" requerido>
        <input
          name="nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Metformina, Losartán, Omeprazol…"
          className="w-full rounded-full bg-card px-[18px] py-3.5 text-[15px] font-semibold shadow-item outline-none placeholder:font-medium placeholder:text-faint focus-visible:ring-2 focus-visible:ring-primary/40"
        />
      </Campo>

      <div>
        <Etiqueta text="Dosis" requerido />
        <div className="flex items-stretch gap-2">
          <div className="flex-1 rounded-full bg-card shadow-item">
            <input
              name="dosis"
              value={dosis}
              onChange={(e) => setDosis(e.target.value)}
              placeholder="500"
              inputMode="decimal"
              className="w-full bg-transparent px-[18px] py-3.5 text-[15px] font-semibold outline-none placeholder:text-faint"
            />
          </div>
          <div className="flex gap-1 rounded-full bg-secondary p-1">
            {UNIDADES.map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setUnidad(u)}
                className={cn(
                  "rounded-full px-2.5 py-2 text-xs font-bold",
                  unidad === u ? "bg-card text-foreground shadow-item" : "text-subtle"
                )}
              >
                {u}
              </button>
            ))}
          </div>
        </div>
        <input type="hidden" name="unidad" value={unidad} />
      </div>

      <div>
        <Etiqueta text="Frecuencia" requerido />
        <div className="flex flex-wrap gap-2">
          {FRECUENCIAS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFrecuencia(f)}
              className={cn(
                "rounded-full px-[17px] py-[11px] text-[13.5px] font-bold transition-all",
                frecuencia === f ? "bg-primary text-primary-foreground shadow-[0_6px_14px_color-mix(in_srgb,var(--primary)_25%,transparent)]" : "bg-card text-slate-brand shadow-item"
              )}
            >
              {f}
            </button>
          ))}
        </div>
        <input type="hidden" name="frecuencia" value={frecuencia} />
      </div>

      <div>
        <Etiqueta text="¿Cuándo tomarlo?" requerido />
        <p className="-mt-1.5 mb-3 text-xs font-medium text-subtle">Podés elegir más de uno</p>
        <div className="grid grid-cols-2 gap-2">
          {MOMENTOS.map((m) => {
            const sel = momentos.includes(m.key);
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => alternarMomento(m.key)}
                className={cn(
                  "flex items-center gap-2.5 rounded-[var(--radius-item)] p-3.5 text-left transition-all motion-reduce:transition-none",
                  sel
                    ? "bg-primary text-primary-foreground shadow-[0_8px_18px_color-mix(in_srgb,var(--primary)_25%,transparent)]"
                    : "bg-card text-foreground shadow-item"
                )}
              >
                <VitaIcon name={m.icon} size={18} color={sel ? "var(--primary-foreground)" : "var(--primary)"} />
                <div className="flex-1">
                  <div className="font-heading text-[13.5px] font-bold">{m.label}</div>
                  <div className={cn("text-[11.5px] font-medium", sel ? "opacity-85 text-primary-foreground" : "text-muted-foreground")}>
                    {m.hora} hs
                  </div>
                </div>
                {sel && <VitaIcon name="check" size={16} color="var(--primary-foreground)" />}
              </button>
            );
          })}
        </div>
        {momentos.map((m) => (
          <input key={m} type="hidden" name="momentos" value={m} />
        ))}
      </div>

      <div>
        <Etiqueta text="En relación a la comida" />
        <div className="flex flex-wrap gap-1.5">
          {COMIDAS.map((c) => (
            <button
              key={c.v}
              type="button"
              onClick={() => setConComida(c.v)}
              className={cn(
                "rounded-full px-[17px] py-[11px] text-[13.5px] font-bold",
                conComida === c.v ? "bg-primary text-primary-foreground shadow-[0_6px_14px_color-mix(in_srgb,var(--primary)_25%,transparent)]" : "bg-card text-slate-brand shadow-item"
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
        <input type="hidden" name="conComida" value={conComida} />
      </div>

      <div>
        <Etiqueta text="Duración del tratamiento" />
        <div className="flex flex-wrap gap-1.5">
          {DURACIONES.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDuracion(d)}
              className={cn(
                "rounded-full px-[17px] py-[11px] text-[13.5px] font-bold",
                duracion === d ? "bg-primary text-primary-foreground shadow-[0_6px_14px_color-mix(in_srgb,var(--primary)_25%,transparent)]" : "bg-card text-slate-brand shadow-item"
              )}
            >
              {d}
            </button>
          ))}
        </div>
        <input type="hidden" name="duracion" value={duracion} />
      </div>

      <Campo label="Notas">
        <textarea
          name="notas"
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          placeholder="Recetado por Dr. Pérez, para hipertensión…"
          rows={3}
          className="w-full resize-none rounded-[20px] bg-card px-[18px] py-3.5 text-[15px] font-medium shadow-item outline-none placeholder:text-faint focus-visible:ring-2 focus-visible:ring-primary/40"
        />
      </Campo>

      {estado.status === "error" && (
        <p className="rounded-[14px] bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">{estado.message}</p>
      )}

      <div
        className="fixed inset-x-0 bottom-0 z-20 mx-auto flex w-full max-w-md gap-2.5 bg-gradient-to-t from-background from-70% to-transparent px-[18px] pt-4"
        style={{ paddingBottom: "var(--safe-bottom)" }}
      >
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-full border border-foreground/10 px-[22px] py-4 font-heading text-sm font-bold text-slate-brand"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={!puedeGuardar || pendiente}
          className={cn(
            "flex-1 rounded-full py-4 font-heading text-sm font-extrabold tracking-[-0.01em] transition-all motion-reduce:transition-none",
            puedeGuardar && !pendiente
              ? "bg-primary text-primary-foreground shadow-[0_3px_10px_color-mix(in_srgb,var(--primary)_35%,transparent)]"
              : "bg-secondary text-subtle"
          )}
        >
          {pendiente ? "Guardando…" : "Guardar medicamento"}
        </button>
      </div>
    </form>
  );
}

function Etiqueta({ text, requerido }: { text: string; requerido?: boolean }) {
  return (
    <div className="eyebrow mb-3.5 flex items-center gap-1 border-b border-foreground/[0.07] pb-2.5 text-subtle">
      {text}
      {requerido && <span className="text-primary">•</span>}
    </div>
  );
}

function Campo({ label, requerido, children }: { label: string; requerido?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <Etiqueta text={label} requerido={requerido} />
      {children}
    </div>
  );
}
