"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Interruptor } from "@/components/vita/interruptor";
import { Segmentado } from "@/components/vita/segmentado";
import { ErrorGuardarSheet } from "@/components/vita/error-guardar-sheet";
import {
  guardarEsperaPersonasAction,
  guardarPreferenciaAvisosAction,
  type EstadoPush,
  type ParchePreferencias,
} from "@/lib/notificaciones/actions";
import {
  ESPERAS_CUIDADOR,
  SILENCIO_SUGERIDO,
  esHoraValida,
  type ClaveBooleana,
  type PreferenciasAvisos,
} from "@/lib/notificaciones/avisos-tipos";

const FILAS_PROPIAS: { clave: ClaveBooleana; label: string; sub: string }[] = [
  { clave: "recordatorio_dosis", label: "Tus medicamentos", sub: "A horario, con botones para confirmar." },
  { clave: "aviso_turnos", label: "Tus turnos", sub: "El día anterior y 2 horas antes." },
  { clave: "stock_bajo", label: "Remedio por terminarse", sub: "Cuando te quedan pocas pastillas." },
];

type PersonaCfg = { id: string; nombre: string; relacion: string | null };

type ErrorGuardado = { mensaje: string; reintentar: () => void };

// Cada interruptor aplica al instante (UI optimista) y guarda con una Server
// Action; si falla, vuelve atrás y abre "No pudimos guardar" con Reintentar.
export function FormularioConfigAvisos({
  inicial,
  personas,
  puedeEditarEspera,
  esperaPersona,
}: {
  inicial: PreferenciasAvisos;
  /** Personas que cuido (vacío si no cuido a nadie o falta la migración 028). */
  personas: PersonaCfg[];
  puedeEditarEspera: boolean;
  esperaPersona: number | null;
}) {
  const [prefs, setPrefs] = useState<PreferenciasAvisos>(inicial);
  const [espera, setEspera] = useState<number>(esperaPersona ?? 30);
  const [error, setError] = useState<ErrorGuardado | null>(null);
  const [reintentando, setReintentando] = useState(false);

  const silencioActivo = prefs.silencio_desde !== null && prefs.silencio_hasta !== null;
  const nombrePersona = personas.length === 1 ? personas[0].nombre : "tu familia";
  const tituloPersona = personas.length === 1 ? `Avisos de ${personas[0].nombre}` : "Avisos de tu familia";

  /** Aplica el cambio ya, guarda, y si falla lo revierte y ofrece reintentar. */
  async function cambiar(opts: {
    aplicar: () => void;
    revertir: () => void;
    guardar: () => Promise<EstadoPush>;
  }) {
    opts.aplicar();
    let r: EstadoPush;
    try {
      r = await opts.guardar();
    } catch {
      r = { status: "error", message: "No pudimos guardar tu cambio. Probá de nuevo." };
    }
    if (r.status === "error") {
      opts.revertir();
      setError({
        mensaje: r.message,
        reintentar: () => {
          setReintentando(true);
          void cambiar(opts).finally(() => setReintentando(false));
          setError(null);
        },
      });
    }
  }

  function cambiarPrefs(parche: ParchePreferencias) {
    const anterior: Record<string, unknown> = {};
    for (const k of Object.keys(parche)) anterior[k] = prefs[k as keyof PreferenciasAvisos];
    return cambiar({
      aplicar: () => setPrefs((p) => ({ ...p, ...parche })),
      revertir: () => setPrefs((p) => ({ ...p, ...(anterior as Partial<PreferenciasAvisos>) })),
      guardar: () => guardarPreferenciaAvisosAction(parche),
    });
  }

  function cambiarEspera(min: number) {
    const anterior = espera;
    return cambiar({
      aplicar: () => setEspera(min),
      revertir: () => setEspera(anterior),
      guardar: () => guardarEsperaPersonasAction(min),
    });
  }

  function alternarSilencio() {
    void cambiarPrefs(
      silencioActivo
        ? { silencio_desde: null, silencio_hasta: null }
        : { silencio_desde: SILENCIO_SUGERIDO.desde, silencio_hasta: SILENCIO_SUGERIDO.hasta }
    );
  }

  function cambiarHora(campo: "silencio_desde" | "silencio_hasta", valor: string) {
    const otro = campo === "silencio_desde" ? prefs.silencio_hasta : prefs.silencio_desde;
    // El input de hora emite "" mientras se edita: solo se guarda un horario completo y válido.
    if (!esHoraValida(valor) || !esHoraValida(otro)) {
      setPrefs((p) => ({ ...p, [campo]: valor }));
      return;
    }
    void cambiarPrefs({ silencio_desde: campo === "silencio_desde" ? valor : otro, silencio_hasta: campo === "silencio_hasta" ? valor : otro });
  }

  return (
    <div className="flex flex-col gap-[18px]">
      <section>
        <h2 className="eyebrow px-0.5 pb-2.5 text-primary">Tus avisos</h2>
        <div className="overflow-hidden rounded-[20px] bg-card shadow-card">
          {FILAS_PROPIAS.map((f) => (
            <FilaSwitch
              key={f.clave}
              label={f.label}
              sub={f.sub}
              activo={prefs[f.clave]}
              onChange={(v) => void cambiarPrefs({ [f.clave]: v })}
            />
          ))}
        </div>
      </section>

      {personas.length > 0 && (
        <section>
          <h2 className="eyebrow px-0.5 pb-2.5 text-persona-violeta-deep">{tituloPersona}</h2>
          <div className="overflow-hidden rounded-[20px] bg-card shadow-card">
            <FilaSwitch
              label="Si no confirma una toma"
              sub={`Te avisamos después del segundo aviso a ${nombrePersona}.`}
              activo={prefs.pendiente_persona}
              onChange={(v) => void cambiarPrefs({ pendiente_persona: v })}
              extra={
                prefs.pendiente_persona && puedeEditarEspera ? (
                  <div className="flex flex-col gap-2">
                    <div className="eyebrow text-subtle">Esperar antes de avisarte</div>
                    <Segmentado
                      etiqueta="Esperar antes de avisarte"
                      valor={espera}
                      onChange={(v) => void cambiarEspera(v)}
                      opciones={ESPERAS_CUIDADOR.map((e) => ({ valor: e.min as number, etiqueta: e.label }))}
                    />
                  </div>
                ) : undefined
              }
            />
            <FilaSwitch
              label="Resumen del día"
              sub="Todas las noches a las 21:00."
              activo={prefs.resumen_dia}
              onChange={(v) => void cambiarPrefs({ resumen_dia: v })}
            />
            <FilaSwitch
              label="Remedio por terminarse"
              sub="Cuando le quedan 5 o menos."
              activo={prefs.stock_persona}
              onChange={(v) => void cambiarPrefs({ stock_persona: v })}
            />
            <FilaSwitch
              label="Sus turnos"
              sub="Para acompañar o recordárselo."
              activo={prefs.turnos_persona}
              onChange={(v) => void cambiarPrefs({ turnos_persona: v })}
            />
          </div>
        </section>
      )}

      <section>
        <h2 className="eyebrow px-0.5 pb-2.5 text-subtle">Si no confirmás una toma</h2>
        <div className="flex flex-col gap-3 rounded-[20px] bg-card p-4 shadow-card">
          <div>
            <div className="font-heading text-[14.5px] font-extrabold tracking-[-0.02em]">Esperar antes de avisar a quien te cuida</div>
            <div className="mt-0.5 text-[11.5px] font-medium leading-snug text-subtle text-pretty">
              Primero te avisamos a vos. Si seguís sin confirmar, después de este tiempo le avisamos a tus cuidadores.
            </div>
          </div>
          <Segmentado
            etiqueta="Espera antes de avisar a quien te cuida"
            valor={prefs.espera_cuidador_min}
            onChange={(v) => void cambiarPrefs({ espera_cuidador_min: v })}
            opciones={ESPERAS_CUIDADOR.map((e) => ({ valor: e.min as number, etiqueta: e.label }))}
          />
        </div>
      </section>

      <section>
        <h2 className="eyebrow px-0.5 pb-2.5 text-subtle">Silencio de noche</h2>
        <div className="overflow-hidden rounded-[20px] bg-card shadow-card">
          <FilaSwitch
            label={silencioActivo ? `De ${prefs.silencio_desde} a ${prefs.silencio_hasta}` : "Silencio de noche"}
            sub={
              personas.length > 0
                ? `Los avisos de tomas sin confirmar de ${nombrePersona} suenan igual.`
                : "Las tomas sin confirmar suenan igual."
            }
            activo={silencioActivo}
            onChange={alternarSilencio}
          />
          {silencioActivo && (
            <div className="flex gap-3 border-t border-foreground/[0.06] px-4 py-3.5">
              <CampoHora label="Desde" valor={prefs.silencio_desde ?? ""} onChange={(v) => cambiarHora("silencio_desde", v)} />
              <CampoHora label="Hasta" valor={prefs.silencio_hasta ?? ""} onChange={(v) => cambiarHora("silencio_hasta", v)} />
            </div>
          )}
        </div>
      </section>

      <ErrorGuardarSheet
        abierto={error !== null}
        detalle={error?.mensaje}
        reintentando={reintentando}
        onReintentar={() => error?.reintentar()}
        onDescartar={() => setError(null)}
      />
    </div>
  );
}

function FilaSwitch({
  label,
  sub,
  activo,
  onChange,
  extra,
}: {
  label: string;
  sub: string;
  activo: boolean;
  onChange: (valor: boolean) => void;
  extra?: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-3 px-4 py-[15px] [&:not(:first-child)]:border-t [&:not(:first-child)]:border-foreground/[0.07]")}>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-heading text-[14.5px] font-extrabold tracking-[-0.02em]">{label}</div>
          <div className="mt-0.5 text-[11.5px] font-medium leading-snug text-subtle text-pretty">{sub}</div>
        </div>
        <Interruptor activo={activo} onChange={onChange} label={label} />
      </div>
      {extra}
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
