"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ErrorGuardarSheet } from "@/components/vita/error-guardar-sheet";
import { EtiquetaSeccion, FranjaDias, NotaLateral, PillsEspecialidad } from "@/components/vita/campos-turno";
import { FilaHora, SelectorHora } from "@/components/vita/selector-hora";
import { VitaIcon } from "@/lib/vita-icons";
import { cn } from "@/lib/utils";
import { crearTurnoAction, type EstadoAccion } from "../rutina/actions";
import { fechaConOffset } from "@/lib/rutina/formato";
import { BASE_LLEVAR, SUGERENCIAS_LLEVAR, type ItemLlevar } from "@/lib/turnos/tipos";

const ESTADO_INICIAL: EstadoAccion = { status: "idle" };

const CLASE_CAMPO =
  "w-full rounded-full bg-card px-[18px] py-[15px] text-[14.5px] font-semibold shadow-item outline-none placeholder:font-medium placeholder:text-faint focus-visible:ring-2 focus-visible:ring-primary/40";

export function FormularioAgregarTurno({
  llevarDisponible,
  paraNombre,
}: {
  /** La columna `turnos.llevar` (migración 023) existe: si no, se oculta "Qué hay que llevar". */
  llevarDisponible: boolean;
  paraNombre?: string;
}) {
  const router = useRouter();
  const [especialidad, setEspecialidad] = useState("");
  const [profesional, setProfesional] = useState("");
  const [lugar, setLugar] = useState("");
  const [telefono, setTelefono] = useState("");
  const [fecha, setFecha] = useState(() => fechaConOffset(1));
  const [hora, setHora] = useState("10:00");
  const [pickerAbierto, setPickerAbierto] = useState(false);

  // "Qué hay que llevar" (D:2256): ítems base, sugerencias por especialidad y propios.
  const [baseOff, setBaseOff] = useState<string[]>(() => BASE_LLEVAR.filter(([, , on]) => !on).map(([t]) => t));
  const [sugAgregadas, setSugAgregadas] = useState<string[]>([]);
  const [sugOcultas, setSugOcultas] = useState<string[]>([]);
  const [extras, setExtras] = useState<string[]>([]);
  const [borrador, setBorrador] = useState("");

  async function accion(prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
    const resultado = await crearTurnoAction(prev, formData);
    if (resultado.status === "success") {
      toast.success("Turno agendado");
      router.push("/app/rutina");
    }
    return resultado;
  }

  const [estado, formAction, pendiente] = useActionState(accion, ESTADO_INICIAL);
  const formRef = useRef<HTMLFormElement>(null);
  const [ocultoPara, setOcultoPara] = useState<typeof estado | null>(null);

  const sugeridas = SUGERENCIAS_LLEVAR[especialidad] ?? [];
  const sugeribles = sugeridas.filter((s) => !sugAgregadas.includes(s) && !sugOcultas.includes(s));
  const filas: { texto: string; etiqueta: string; quitar: () => void }[] = [
    ...BASE_LLEVAR.filter(([t]) => !baseOff.includes(t)).map(([t, tag]) => ({
      texto: t,
      etiqueta: tag,
      quitar: () => setBaseOff((p) => [...p, t]),
    })),
    ...sugAgregadas.filter((s) => sugeridas.includes(s)).map((s) => ({
      texto: s,
      etiqueta: "",
      quitar: () => setSugAgregadas((p) => p.filter((x) => x !== s)),
    })),
    ...extras.map((x, i) => ({ texto: x, etiqueta: "", quitar: () => setExtras((p) => p.filter((_, j) => j !== i)) })),
  ];
  const llevar: ItemLlevar[] = filas.map((f) => ({ t: f.texto, ok: false }));

  function agregarExtra() {
    const v = borrador.trim();
    if (!v) return;
    setExtras((p) => [...p, v.slice(0, 80)]);
    setBorrador("");
  }

  const faltantes = [!especialidad.trim() && "la especialidad", !fecha.trim() && "la fecha"].filter(Boolean) as string[];
  const puedeGuardar = faltantes.length === 0;

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-[22px] pb-24">
      <div>
        <EtiquetaSeccion text="Especialidad" />
        <div className="mt-3.5">
          <PillsEspecialidad valor={especialidad} onCambio={setEspecialidad} />
        </div>
        <input type="hidden" name="especialidad" value={especialidad} />
      </div>

      <div>
        <EtiquetaSeccion text="Profesional y lugar" />
        <div className="mt-3.5 flex flex-col gap-[9px]">
          <input name="profesional" value={profesional} onChange={(e) => setProfesional(e.target.value)} placeholder="Dr. / Dra." className={CLASE_CAMPO} />
          <input name="lugar" value={lugar} onChange={(e) => setLugar(e.target.value)} placeholder="Sanatorio, clínica o centro" className={CLASE_CAMPO} />
          {llevarDisponible && (
            <input name="telefono" value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="Teléfono del consultorio (opcional)" inputMode="tel" aria-label="Teléfono del consultorio" className={CLASE_CAMPO} />
          )}
        </div>
      </div>

      <div>
        <EtiquetaSeccion text="Fecha y hora" />
        <div className="mt-3.5">
          <FranjaDias valor={fecha} onCambio={setFecha} />
        </div>
        <div className="mt-3">
          <FilaHora etiqueta="Hora del turno" hora={hora} placeholderRelacion={null} onClick={() => setPickerAbierto(true)} />
        </div>
        <input type="hidden" name="fecha" value={fecha} />
        <input type="hidden" name="hora" value={hora} />
        <NotaLateral>
          Vita te avisa la noche anterior y unas 2 horas antes del turno{especialidad ? ` de ${especialidad.toLowerCase()}` : ""}.
        </NotaLateral>
      </div>

      {llevarDisponible && (
        <div>
          <EtiquetaSeccion text="Qué hay que llevar" />
          <ul className="mt-3.5 flex flex-col gap-2">
            {BASE_LLEVAR.map(([t, tag]) => (
              <FilaLlevar
                key={t}
                texto={t}
                etiqueta={tag}
                activo={!baseOff.includes(t)}
                alternar={() => setBaseOff((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]))}
              />
            ))}
            {sugAgregadas.filter((s) => sugeridas.includes(s)).map((s) => (
              <FilaLlevar key={s} texto={s} etiqueta="" activo alternar={() => setSugAgregadas((p) => p.filter((x) => x !== s))} />
            ))}
            {extras.map((x, i) => (
              <FilaLlevar key={`${x}-${i}`} texto={x} etiqueta="" activo alternar={() => setExtras((p) => p.filter((_, j) => j !== i))} />
            ))}
          </ul>

          {sugeribles.length > 0 && (
            <>
              <div className="mt-4 text-[12.5px] font-bold text-slate-brand">Vita sugiere para {especialidad.toLowerCase()}</div>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {sugeribles.map((g) => (
                  <div key={g} className="inline-flex items-center overflow-hidden rounded-full border-[1.5px] border-dashed border-primary bg-primary/[0.06]">
                    <button
                      type="button"
                      onClick={() => setSugAgregadas((p) => [...p, g])}
                      className="inline-flex items-center gap-1.5 py-[9px] pl-[13px] pr-1.5 text-[13.5px] font-bold text-teal-deep"
                    >
                      <VitaIcon name="plus" size={13} strokeWidth={3} />
                      {g}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSugOcultas((p) => [...p, g])}
                      aria-label="Borrar sugerencia"
                      className="flex items-center py-[9px] pl-1.5 pr-3 text-subtle"
                    >
                      <VitaIcon name="close" size={12} strokeWidth={3} />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="mt-3 flex gap-2">
            <input
              value={borrador}
              onChange={(e) => setBorrador(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  agregarExtra();
                }
              }}
              placeholder="Agregar otra cosa"
              className="min-w-0 flex-1 rounded-full bg-card px-[18px] py-3.5 text-[14.5px] font-semibold shadow-item outline-none placeholder:font-medium placeholder:text-faint focus-visible:ring-2 focus-visible:ring-primary/40"
            />
            <button
              type="button"
              onClick={agregarExtra}
              className={cn("shrink-0 rounded-full px-[18px] text-[13.5px] font-extrabold text-primary-foreground", borrador.trim() ? "bg-primary" : "bg-line")}
            >
              Agregar
            </button>
          </div>
          <NotaLateral>
            Lo ves la noche anterior, junto con el aviso del turno. El DNI y la credencial pueden ir en el celular. Remedios y mediciones ya van en el resumen para el médico.
          </NotaLateral>
          <input type="hidden" name="llevar" value={JSON.stringify(llevar)} />
        </div>
      )}

      <SelectorHora
        abierto={pickerAbierto}
        hora={hora}
        conComidas={false}
        onCerrar={() => setPickerAbierto(false)}
        onConfirmar={(h) => {
          setHora(h);
          setPickerAbierto(false);
        }}
      />

      {/* "No pudimos guardar" (V7): lo cargado sigue en el formulario. */}
      <ErrorGuardarSheet
        abierto={estado.status === "error" && ocultoPara !== estado}
        detalle={estado.status === "error" ? estado.message : null}
        reintentando={pendiente}
        onReintentar={() => formRef.current?.requestSubmit()}
        onCerrar={() => setOcultoPara(estado)}
        onDescartar={() => router.back()}
      />

      <div
        className="fixed inset-x-0 bottom-0 z-20 mx-auto flex w-full max-w-md gap-2.5 bg-gradient-to-t from-background from-70% to-transparent px-[18px] pt-4"
        style={{ paddingBottom: "var(--safe-bottom)" }}
      >
        {!puedeGuardar && (
          <p className="absolute inset-x-0 -top-3 text-center text-xs font-semibold text-subtle" aria-live="polite">
            Para guardar falta elegir {faltantes.join(", ").replace(/, ([^,]*)$/, " y $1")}
          </p>
        )}
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-full border border-foreground/10 px-[22px] py-4 font-heading text-sm font-bold text-slate-brand"
        >
          Atrás
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
          {pendiente ? "Guardando…" : paraNombre ? `+ Agendar turno a ${paraNombre}` : "✓ Guardar turno"}
        </button>
      </div>
    </form>
  );
}

function FilaLlevar({ texto, etiqueta, activo, alternar }: { texto: string; etiqueta: string; activo: boolean; alternar: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={alternar}
        aria-pressed={activo}
        className="flex w-full items-center gap-3 rounded-2xl bg-card px-4 py-[13px] text-left shadow-item transition-transform active:scale-[0.99] motion-reduce:transition-none"
      >
        <span
          className={cn(
            "flex size-[22px] shrink-0 items-center justify-center rounded-full transition-all",
            activo ? "bg-primary" : "border-2 border-line-strong bg-card"
          )}
        >
          <VitaIcon name="check" size={13} strokeWidth={3.4} color="var(--primary-foreground)" className={activo ? "opacity-100" : "opacity-0"} />
        </span>
        <span className={cn("min-w-0 flex-1 text-[14.5px] font-bold", activo ? "text-foreground" : "text-subtle")}>{texto}</span>
        {etiqueta && <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-subtle">{etiqueta}</span>}
      </button>
    </li>
  );
}
