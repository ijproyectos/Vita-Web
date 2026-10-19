"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { guardarPreferenciasAvisosAction } from "@/lib/notificaciones/actions";
import {
  ESPERAS_CUIDADOR,
  SILENCIO_SUGERIDO,
  esHoraValida,
  type PreferenciasAvisos,
} from "@/lib/notificaciones/avisos-tipos";

type ClaveBooleana = "recordatorio_dosis" | "aviso_turnos" | "stock_bajo";

const FILAS_PROPIAS: { clave: ClaveBooleana; label: string; sub: string }[] = [
  { clave: "recordatorio_dosis", label: "Tus medicamentos", sub: "A horario, con botones para confirmar." },
  { clave: "aviso_turnos", label: "Tus turnos", sub: "El día anterior y 2 horas antes." },
  { clave: "stock_bajo", label: "Remedio por terminarse", sub: "Cuando te quedan pocas pastillas." },
];

export function FormularioConfigAvisos({ inicial }: { inicial: PreferenciasAvisos }) {
  const [prefs, setPrefs] = useState<PreferenciasAvisos>(inicial);
  const [pendiente, startTransition] = useTransition();

  const silencioActivo = prefs.silencio_desde !== null && prefs.silencio_hasta !== null;
  const horarioValido = !silencioActivo || (esHoraValida(prefs.silencio_desde) && esHoraValida(prefs.silencio_hasta));

  function alternarSilencio() {
    setPrefs((p) =>
      p.silencio_desde !== null
        ? { ...p, silencio_desde: null, silencio_hasta: null }
        : { ...p, silencio_desde: SILENCIO_SUGERIDO.desde, silencio_hasta: SILENCIO_SUGERIDO.hasta }
    );
  }

  function guardar() {
    if (!horarioValido || pendiente) return;
    startTransition(async () => {
      try {
        const r = await guardarPreferenciasAvisosAction(prefs);
        if (r.status === "error") toast.error(r.message);
        else toast.success("Guardamos tus preferencias");
      } catch {
        toast.error("No pudimos guardar tus preferencias. Probá de nuevo.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-[18px]">
      <section>
        <h2 className="eyebrow px-0.5 pb-[9px] text-primary">Tus avisos</h2>
        <div className="overflow-hidden rounded-[20px] bg-card shadow-card">
          {FILAS_PROPIAS.map((f) => (
            <FilaSwitch
              key={f.clave}
              label={f.label}
              sub={f.sub}
              activo={prefs[f.clave]}
              onChange={(v) => setPrefs((p) => ({ ...p, [f.clave]: v }))}
            />
          ))}
        </div>
      </section>

      <section>
        <h2 className="eyebrow px-0.5 pb-[9px] text-subtle">Si no confirmás una toma</h2>
        <div className="flex flex-col gap-3 rounded-[20px] bg-card p-4 shadow-card">
          <div>
            <div className="font-heading text-[14.5px] font-extrabold tracking-[-0.02em]">Esperar antes de avisar a quien te cuida</div>
            <div className="mt-0.5 text-[11.5px] font-medium leading-snug text-subtle text-pretty">
              Primero te avisamos a vos. Si seguís sin confirmar, después de este tiempo le avisamos a tus cuidadores.
            </div>
          </div>
          <div role="radiogroup" aria-label="Espera antes de avisar a quien te cuida" className="flex rounded-full bg-secondary p-1">
            {ESPERAS_CUIDADOR.map((e) => (
              <button
                key={e.min}
                type="button"
                role="radio"
                aria-checked={prefs.espera_cuidador_min === e.min}
                onClick={() => setPrefs((p) => ({ ...p, espera_cuidador_min: e.min }))}
                className={cn(
                  "flex-1 rounded-full px-2 py-2.5 text-[13px] font-bold transition-all motion-reduce:transition-none",
                  prefs.espera_cuidador_min === e.min ? "bg-card text-foreground shadow-item" : "text-subtle"
                )}
              >
                {e.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section>
        <h2 className="eyebrow px-0.5 pb-[9px] text-subtle">Silencio de noche</h2>
        <div className="overflow-hidden rounded-[20px] bg-card shadow-card">
          <FilaSwitch
            label={silencioActivo ? `De ${prefs.silencio_desde} a ${prefs.silencio_hasta}` : "Silencio de noche"}
            sub="Las tomas sin confirmar suenan igual."
            activo={silencioActivo}
            onChange={alternarSilencio}
          />
          {silencioActivo && (
            <div className="flex gap-3 border-t border-foreground/[0.06] px-4 py-3.5">
              <CampoHora label="Desde" valor={prefs.silencio_desde ?? ""} onChange={(v) => setPrefs((p) => ({ ...p, silencio_desde: v }))} />
              <CampoHora label="Hasta" valor={prefs.silencio_hasta ?? ""} onChange={(v) => setPrefs((p) => ({ ...p, silencio_hasta: v }))} />
            </div>
          )}
        </div>
      </section>

      <button
        type="button"
        onClick={guardar}
        disabled={!horarioValido || pendiente}
        className={cn(
          "rounded-full py-4 font-heading text-[15px] font-extrabold tracking-[-0.01em] transition-all motion-reduce:transition-none",
          horarioValido && !pendiente
            ? "bg-primary text-primary-foreground shadow-[0_3px_10px_color-mix(in_srgb,var(--primary)_35%,transparent)]"
            : "bg-secondary text-subtle"
        )}
      >
        {pendiente ? "Guardando…" : "Guardar cambios"}
      </button>
    </div>
  );
}

function FilaSwitch({
  label,
  sub,
  activo,
  onChange,
}: {
  label: string;
  sub: string;
  activo: boolean;
  onChange: (valor: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5 [&:not(:first-child)]:border-t [&:not(:first-child)]:border-foreground/[0.06]">
      <div className="min-w-0 flex-1">
        <div className="font-heading text-[14.5px] font-extrabold tracking-[-0.02em]">{label}</div>
        <div className="mt-0.5 text-[11.5px] font-medium leading-snug text-subtle text-pretty">{sub}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={activo}
        aria-label={label}
        onClick={() => onChange(!activo)}
        className={cn(
          "relative h-7 w-[46px] shrink-0 rounded-full transition-colors motion-reduce:transition-none",
          activo ? "bg-primary" : "bg-foreground/15"
        )}
      >
        <span
          className={cn(
            "absolute top-[3px] size-[22px] rounded-full bg-card shadow transition-all motion-reduce:transition-none",
            activo ? "left-[21px]" : "left-[3px]"
          )}
        />
      </button>
    </div>
  );
}

function CampoHora({ label, valor, onChange }: { label: string; valor: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-1 flex-col gap-1.5">
      <span className="eyebrow text-subtle">{label}</span>
      <input
        type="time"
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-[var(--radius-item)] bg-secondary px-3.5 py-3 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      />
    </label>
  );
}
