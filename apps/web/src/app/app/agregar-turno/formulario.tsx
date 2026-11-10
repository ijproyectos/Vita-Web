"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useVolver } from "@/lib/navegacion/rastreador";
import { toast } from "sonner";
import { ErrorGuardarSheet } from "@/components/vita/error-guardar-sheet";
import { CalendarioTurno, CampoEspecialidad, EtiquetaSeccion, NotaLateral, SelectorHoraTurno } from "@/components/vita/campos-turno";
import { FilaHora } from "@/components/vita/selector-hora";
import { Interruptor } from "@/components/vita/interruptor";
import { VitaIcon } from "@/lib/vita-icons";
import { cn } from "@/lib/utils";
import { crearTurnoAction, type EstadoAccion } from "../rutina/actions";
import { credencialDeObraSocial } from "@/lib/turnos/alta";
import { SUGERENCIAS_LLEVAR, type ItemLlevar } from "@/lib/turnos/tipos";

/** El DNI es el único ítem fijo; la credencial entra como sugerencia. */
const DNI = "DNI";

const ESTADO_INICIAL: EstadoAccion = { status: "idle" };

const CLASE_CAMPO =
  "w-full rounded-full bg-card px-[18px] py-[15px] text-[14.5px] font-semibold shadow-item outline-none placeholder:font-medium placeholder:text-faint focus-visible:ring-2 focus-visible:ring-primary/40";

export function FormularioAgregarTurno({
  llevarDisponible,
  paraNombre,
  especialidadesUsadas,
  obraSocial,
}: {
  /** La columna `turnos.llevar` (migración 023) existe: si no, se oculta "Qué hay que llevar". */
  llevarDisponible: boolean;
  paraNombre?: string;
  especialidadesUsadas: string[];
  obraSocial: string | null;
}) {
  const router = useRouter();
  const volver = useVolver("/app/rutina");
  const [especialidad, setEspecialidad] = useState("");
  const [profesional, setProfesional] = useState("");
  const [lugar, setLugar] = useState("");
  const [telefono, setTelefono] = useState("");
  const [fecha, setFecha] = useState("");
  const [hora, setHora] = useState("10:30");
  const [pickerAbierto, setPickerAbierto] = useState(false);
  const [acompanado, setAcompanado] = useState(false);

  // "Qué hay que llevar": DNI, sugerencias (credencial y por especialidad) y propios.
  const [conDni, setConDni] = useState(true);
  const [sugAgregadas, setSugAgregadas] = useState<string[]>([]);
  const [sugOcultas, setSugOcultas] = useState<string[]>([]);
  const [extras, setExtras] = useState<string[]>([]);
  const [borrador, setBorrador] = useState("");

  async function accion(prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
    const resultado = await crearTurnoAction(prev, formData);
    if (resultado.status === "success") {
      toast.success("Turno agendado");
      router.replace("/app/rutina");
    }
    return resultado;
  }

  const [estado, formAction, pendiente] = useActionState(accion, ESTADO_INICIAL);
  const formRef = useRef<HTMLFormElement>(null);
  const [ocultoPara, setOcultoPara] = useState<typeof estado | null>(null);

  const credencial = credencialDeObraSocial(obraSocial);
  const sugeridas = [...(credencial ? [credencial] : []), ...(SUGERENCIAS_LLEVAR[especialidad] ?? [])];
  const sugeribles = sugeridas.filter((s) => !sugAgregadas.includes(s) && !sugOcultas.includes(s));
  const filas: { texto: string }[] = [
    ...(conDni ? [{ texto: DNI }] : []),
    ...sugAgregadas.filter((s) => sugeridas.includes(s)).map((texto) => ({ texto })),
    ...extras.map((texto) => ({ texto })),
  ];
  const llevar: ItemLlevar[] = filas.map((f) => ({ t: f.texto, ok: false }));

  function agregarExtra() {
    const v = borrador.trim();
    if (!v) return;
    setExtras((p) => [...p, v.slice(0, 80)]);
    setBorrador("");
  }

  const faltantes = [!fecha.trim() && "el día del turno"].filter(Boolean) as string[];
  const puedeGuardar = faltantes.length === 0;

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-[22px] pb-24">
      <div>
        <EtiquetaSeccion text="Especialidad" />
        <div className="mt-3.5">
          <CampoEspecialidad valor={especialidad} onCambio={setEspecialidad} usadas={especialidadesUsadas} />
        </div>
        <input type="hidden" name="especialidad" value={especialidad.trim() || "Turno médico"} />
      </div>

      <div>
        <EtiquetaSeccion text="Profesional y lugar" />
        <div className="mt-3.5 flex flex-col gap-[9px]">
          <input name="profesional" value={profesional} onChange={(e) => setProfesional(e.target.value)} placeholder="Dr. / Dra." className={CLASE_CAMPO} />
          <div className="flex items-center gap-2">
            <input name="lugar" value={lugar} onChange={(e) => setLugar(e.target.value)} placeholder="Sanatorio, clínica o centro" className={cn(CLASE_CAMPO, "min-w-0 flex-1")} />
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lugar.trim() || "sanatorio")}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Abrir en Google Maps"
              className="flex shrink-0 items-center gap-1.5 rounded-full bg-card px-3.5 py-[15px] text-[13px] font-extrabold text-teal-deep shadow-item"
            >
              <VitaIcon name="navigation" size={14} strokeWidth={2.4} />
              Mapa
            </a>
          </div>
          {llevarDisponible && (
            <input name="telefono" value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="Teléfono del consultorio (opcional)" inputMode="tel" aria-label="Teléfono del consultorio" className={CLASE_CAMPO} />
          )}
        </div>
      </div>

      <div>
        <EtiquetaSeccion text="Fecha y hora" />
        <div className="mt-3.5">
          <CalendarioTurno valor={fecha} onCambio={setFecha} />
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

      <div>
        <div className="flex items-center gap-3 rounded-[var(--radius-item)] bg-card px-4 py-[13px] shadow-item">
          <div className="min-w-0 flex-1">
            <div className="font-heading text-sm font-bold">Voy a ir acompañado</div>
            <div className="mt-0.5 text-xs font-medium text-subtle">Si tenés familia en vita, les avisamos para que te acompañen.</div>
          </div>
          <Interruptor activo={acompanado} onChange={setAcompanado} label="Voy a ir acompañado" />
        </div>
        {acompanado && <input type="hidden" name="acompanado" value="on" />}
      </div>

      {llevarDisponible && (
        <div>
          <EtiquetaSeccion text="Qué hay que llevar" />
          <ul className="mt-3.5 flex flex-col gap-2">
            <FilaLlevar texto={DNI} etiqueta="Siempre" activo={conDni} alternar={() => setConDni((v) => !v)} />
            {sugAgregadas.filter((s) => sugeridas.includes(s)).map((s) => (
              <FilaLlevar key={s} texto={s} etiqueta="" sub={s === credencial ? "Tenela a mano en el celular" : undefined} activo alternar={() => setSugAgregadas((p) => p.filter((x) => x !== s))} />
            ))}
            {extras.map((x, i) => (
              <FilaLlevar key={`${x}-${i}`} texto={x} etiqueta="" activo alternar={() => setExtras((p) => p.filter((_, j) => j !== i))} />
            ))}
          </ul>

          {sugeribles.length > 0 && (
            <>
              <div className="mt-4 text-[12.5px] font-bold text-slate-brand">{especialidad.trim() ? `Vita sugiere para ${especialidad.trim().toLowerCase()}` : "Vita sugiere"}</div>
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

      <SelectorHoraTurno
        abierto={pickerAbierto}
        hora={hora}
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
        onDescartar={() => volver()}
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
          onClick={() => volver()}
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

function FilaLlevar({ texto, etiqueta, sub, activo, alternar }: { texto: string; etiqueta: string; sub?: string; activo: boolean; alternar: () => void }) {
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
        <span className="min-w-0 flex-1">
          <span className={cn("block text-[14.5px] font-bold", activo ? "text-foreground" : "text-subtle")}>{texto}</span>
          {sub && <span className="mt-0.5 block text-xs font-medium text-subtle">{sub}</span>}
        </span>
        {etiqueta && <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-subtle">{etiqueta}</span>}
      </button>
    </li>
  );
}
