"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { VitaIcon } from "@/lib/vita-icons";
import { cn } from "@/lib/utils";
import { crearTurnoAction, type EstadoAccion } from "../rutina/actions";
import { fechaConOffset, formatoFechaCorta } from "@/lib/rutina/formato";
import { ESPECIALIDADES_SUGERIDAS } from "@/lib/turnos/tipos";
import { ICONO_ESPECIALIDAD } from "@/lib/turnos/icono";

const ESTADO_INICIAL: EstadoAccion = { status: "idle" };

const RECORDATORIOS = [
  { v: "1h", label: "1 hora antes" },
  { v: "1d", label: "1 día antes" },
  { v: "2d", label: "2 días antes" },
  { v: "1w", label: "1 semana antes" },
];

const HORARIOS_SUGERIDOS = ["08:00", "10:00", "14:00", "17:00"];

export function FormularioAgregarTurno() {
  const router = useRouter();
  const [especialidad, setEspecialidad] = useState("");
  const [profesional, setProfesional] = useState("");
  const [lugar, setLugar] = useState("");
  const [fecha, setFecha] = useState("");
  const [hora, setHora] = useState("");
  const [motivo, setMotivo] = useState("");
  const [recordatorio, setRecordatorio] = useState("1d");
  const [acompanado, setAcompanado] = useState(false);
  const [notas, setNotas] = useState("");

  async function accion(prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
    const resultado = await crearTurnoAction(prev, formData);
    if (resultado.status === "success") {
      toast.success("Turno agregado");
      router.push("/app/rutina");
    }
    return resultado;
  }

  const [estado, formAction, pendiente] = useActionState(accion, ESTADO_INICIAL);
  const puedeGuardar = especialidad.trim() && fecha.trim() && hora.trim();

  return (
    <form action={formAction} className="flex flex-col gap-[22px] pb-24">
      <div>
        <Etiqueta text="Especialidad" requerido />
        <div className="grid grid-cols-4 gap-2">
          {ESPECIALIDADES_SUGERIDAS.map((e) => {
            const sel = especialidad === e;
            return (
              <button
                key={e}
                type="button"
                onClick={() => setEspecialidad(e)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-[var(--radius-item)] px-1.5 pb-2.5 pt-3.5 transition-all motion-reduce:transition-none",
                  sel
                    ? "bg-primary text-primary-foreground shadow-[0_8px_18px_color-mix(in_srgb,var(--primary)_25%,transparent)]"
                    : "bg-card text-foreground shadow-item"
                )}
              >
                <VitaIcon name={ICONO_ESPECIALIDAD[e] ?? "plus"} size={20} color={sel ? "var(--primary-foreground)" : "var(--primary)"} />
                <span className="text-center text-[10.5px] font-semibold leading-tight">{e}</span>
              </button>
            );
          })}
        </div>
        <input type="hidden" name="especialidad" value={especialidad} />
      </div>

      <CampoTexto label="Profesional" placeholder="Dra. Laura Méndez" name="profesional" value={profesional} onChange={setProfesional} />
      <CampoTexto label="Lugar / institución" placeholder="Hospital Italiano · sede Perón" name="lugar" value={lugar} onChange={setLugar} icon="location" />

      <div className="flex items-start gap-3">
        <div className="flex-1">
          <Etiqueta text="Fecha" requerido />
          <div className="flex items-center gap-2 rounded-[var(--radius-item)] bg-card px-3.5 py-3.5 shadow-item">
            <VitaIcon name="routine" size={16} color="var(--primary)" />
            <input
              name="fecha"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="w-full bg-transparent text-sm font-semibold outline-none"
            />
          </div>
          <div className="mt-2 flex gap-1.5">
            {[
              ["Hoy", 0],
              ["Mañana", 1],
              ["+3 días", 3],
            ].map(([label, offset]) => (
              <button
                key={label as string}
                type="button"
                onClick={() => setFecha(fechaConOffset(offset as number))}
                className="rounded-full px-2.5 py-1 text-[11.5px] font-bold text-teal-deep shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--primary)_25%,transparent)]"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1">
          <Etiqueta text="Hora" requerido />
          <div className="flex items-center gap-2 rounded-[var(--radius-item)] bg-card px-3.5 py-3.5 shadow-item">
            <VitaIcon name="clock" size={16} color="var(--primary)" />
            <input
              name="hora"
              type="time"
              value={hora}
              onChange={(e) => setHora(e.target.value)}
              className="w-full bg-transparent text-sm font-semibold outline-none"
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {HORARIOS_SUGERIDOS.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setHora(h)}
                className="rounded-full px-2.5 py-1 text-[11.5px] font-bold text-teal-deep shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--primary)_25%,transparent)]"
              >
                {h}
              </button>
            ))}
          </div>
        </div>
      </div>
      {fecha && <p className="-mt-3 text-xs font-medium text-subtle">{formatoFechaCorta(fecha)}</p>}

      <CampoTexto label="Motivo" placeholder="Control anual, seguimiento…" name="motivo" value={motivo} onChange={setMotivo} />

      <div>
        <Etiqueta text="Recordarme" />
        <div className="flex flex-wrap gap-1.5">
          {RECORDATORIOS.map((r) => (
            <button
              key={r.v}
              type="button"
              onClick={() => setRecordatorio(r.v)}
              className={cn(
                "rounded-full px-[17px] py-[11px] text-[13.5px] font-bold",
                recordatorio === r.v ? "bg-primary text-primary-foreground shadow-[0_6px_14px_color-mix(in_srgb,var(--primary)_25%,transparent)]" : "bg-card text-slate-brand shadow-item"
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
        <input type="hidden" name="recordatorio" value={RECORDATORIOS.find((r) => r.v === recordatorio)?.label} />
      </div>

      <label className="flex cursor-pointer items-center gap-3 rounded-[var(--radius-item)] bg-card p-3.5 shadow-item">
        <VitaIcon name="user" size={18} color="var(--primary)" />
        <div className="flex-1">
          <div className="font-heading text-[13.5px] font-bold">Voy a ir acompañado</div>
          <div className="text-xs text-muted-foreground">Para que vita se lo recuerde también a esa persona</div>
        </div>
        <input
          type="checkbox"
          name="acompanado"
          checked={acompanado}
          onChange={(e) => setAcompanado(e.target.checked)}
          className="sr-only"
        />
        <span
          className={cn(
            "relative h-6 w-[42px] shrink-0 rounded-full transition-colors",
            acompanado ? "bg-primary" : "bg-foreground/15"
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 size-5 rounded-full bg-card shadow transition-all",
              acompanado ? "left-[20px]" : "left-0.5"
            )}
          />
        </span>
      </label>

      <div>
        <Etiqueta text="Notas" />
        <textarea
          name="notas"
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          placeholder="Llevar estudios previos, ayunar 8hs, etc."
          rows={3}
          className="w-full resize-none rounded-[20px] bg-card px-[18px] py-3.5 text-[15px] font-medium shadow-item outline-none placeholder:text-faint focus-visible:ring-2 focus-visible:ring-primary/40"
        />
      </div>

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
          {pendiente ? "Guardando…" : "Guardar turno"}
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

function CampoTexto({
  label,
  placeholder,
  name,
  value,
  onChange,
  icon,
}: {
  label: string;
  placeholder: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  icon?: string;
}) {
  return (
    <div>
      <Etiqueta text={label} />
      <div className="flex items-center gap-2.5 rounded-full bg-card px-[18px] py-1 shadow-item">
        {icon && <VitaIcon name={icon} size={16} className="text-muted-foreground" />}
        <input
          name={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-transparent py-3 text-[15px] font-semibold outline-none placeholder:font-medium placeholder:text-faint"
        />
      </div>
    </div>
  );
}
