"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ErrorGuardarSheet } from "@/components/vita/error-guardar-sheet";
import {
  BotonLapiz,
  BotonPapelera,
  BotonesGuardar,
  CampoPill,
  CLASE_INPUT_PILL,
  ConfirmarEliminar,
} from "@/components/vita/edicion-lista";
import { VitaIcon } from "@/lib/vita-icons";
import { FranjaDias, PillsEspecialidad } from "@/components/vita/campos-turno";
import { FilaHora, SelectorHora } from "@/components/vita/selector-hora";
import { etiquetaDia, formatoFechaCorta } from "@/lib/rutina/formato";
import { iconoDeEspecialidad, tonoDeTurno } from "@/lib/turnos/icono";
import type { Turno } from "@/lib/turnos/tipos";
import type { PerfilActivo } from "@/lib/familia/tipos";
import { DetalleTurno } from "../rutina/detalle-turno";
import { eliminarTurnoAction, guardarTurnoAction, type DatosEdicionTurno } from "./actions";

type ErrorSheet = { detalle: string; reintentar: () => void; descartar: () => void } | null;

function aForm(t: Turno): DatosEdicionTurno {
  return {
    especialidad: t.especialidad,
    profesional: t.profesional ?? "",
    fecha: t.fecha,
    hora: t.hora.slice(0, 5),
    lugar: t.lugar ?? "",
    direccion: t.direccion === undefined ? undefined : (t.direccion ?? ""),
    telefono: t.telefono === undefined ? undefined : (t.telefono ?? ""),
    notas: t.notas ?? "",
  };
}

function cuando(t: Turno): string {
  const dia = etiquetaDia(t.fecha);
  return `${dia === "Hoy" || dia === "Mañana" ? dia : formatoFechaCorta(t.fecha)} a las ${t.hora.slice(0, 5)}`;
}

export function ListaTurnos({
  turnos,
  editarInicial,
  puedeEditar,
  perfil,
}: {
  turnos: Turno[];
  editarInicial?: string;
  puedeEditar: boolean;
  perfil: PerfilActivo;
}) {
  const router = useRouter();
  const [editandoId, setEditandoId] = useState<string | null>(editarInicial ?? null);
  const [form, setForm] = useState<DatosEdicionTurno | null>(() => {
    const t = turnos.find((x) => x.id === editarInicial);
    return t ? aForm(t) : null;
  });
  const [borrando, setBorrando] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<Turno | null>(null);
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<ErrorSheet>(null);

  const porFecha = new Map<string, Turno[]>();
  for (const t of turnos) {
    if (!porFecha.has(t.fecha)) porFecha.set(t.fecha, []);
    porFecha.get(t.fecha)!.push(t);
  }

  function cerrarEdicion() {
    setEditandoId(null);
    setForm(null);
    setError(null);
    if (editarInicial) router.replace("/app/turnos");
  }

  function cerrarEdicionSinRuta() {
    setEditandoId(null);
    setForm(null);
  }

  function guardar(id: string, datos: DatosEdicionTurno) {
    startTransition(async () => {
      const r = await guardarTurnoAction(id, datos);
      if (r.status === "success") {
        toast.success("Turno guardado");
        cerrarEdicion();
        router.refresh();
      } else {
        setError({ detalle: r.status === "error" ? r.message : "No se pudo guardar.", reintentar: () => guardar(id, datos), descartar: cerrarEdicion });
      }
    });
  }

  function eliminar(t: Turno) {
    startTransition(async () => {
      const r = await eliminarTurnoAction(t.id);
      if (r.status === "success") {
        toast.success(`Turno de ${t.especialidad} eliminado`);
        setBorrando(null);
        setError(null);
        router.refresh();
      } else {
        setError({ detalle: r.status === "error" ? r.message : "No se pudo guardar.", reintentar: () => eliminar(t), descartar: () => { setBorrando(null); setError(null); } });
      }
    });
  }

  return (
    <>
      {[...porFecha.entries()].map(([fecha, items]) => (
        <section key={fecha}>
          <h2 className="eyebrow px-0.5 pb-[9px] text-subtle">
            {etiquetaDia(fecha) === "Hoy" || etiquetaDia(fecha) === "Mañana"
              ? `${etiquetaDia(fecha)} · ${formatoFechaCorta(fecha)}`
              : formatoFechaCorta(fecha)}
          </h2>
          <ul className="overflow-hidden rounded-[20px] bg-card shadow-card">
            {items.map((t, i) => (
              <li key={t.id} className={i > 0 ? "border-t border-foreground/[0.06]" : ""}>
                {editandoId === t.id && form ? (
                  <FormEdicionTurno
                    form={form}
                    onCambio={setForm}
                    pendiente={pendiente}
                    onGuardar={() => guardar(t.id, form)}
                    onCancelar={cerrarEdicion}
                  />
                ) : borrando === t.id ? (
                  <ConfirmarEliminar
                    titulo={`¿Eliminar el turno de ${t.especialidad}?`}
                    detalle={`${cuando(t)} · dejan de llegar sus avisos.`}
                    pendiente={pendiente}
                    onConfirmar={() => eliminar(t)}
                    onCancelar={() => setBorrando(null)}
                  />
                ) : (
                  <div className="flex items-center gap-3 py-3.5 pl-4 pr-3.5">
                    <button
                      type="button"
                      onClick={() => setAbierto(t)}
                      aria-label={`Turno de ${t.especialidad}, ver detalle`}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <span
                        className="flex size-10 shrink-0 items-center justify-center rounded-[13px] bg-canvas"
                        style={{ color: tonoDeTurno(t.especialidad, i) }}
                      >
                        <VitaIcon name={iconoDeEspecialidad(t.especialidad)} size={19} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-heading text-[14.5px] font-extrabold tracking-[-0.02em]">{t.especialidad}</div>
                        <div className="mt-0.5 truncate text-[11.5px] font-medium text-subtle">
                          {[t.profesional, t.lugar].filter(Boolean).join(" · ") || "Sin profesional cargado"}
                        </div>
                      </div>
                      <div className="text-[13px] font-bold tabular-nums">{t.hora.slice(0, 5)}</div>
                    </button>
                    {puedeEditar && (
                      <>
                        <BotonLapiz
                          etiqueta={`Editar el turno de ${t.especialidad}`}
                          onClick={() => { setBorrando(null); setEditandoId(t.id); setForm(aForm(t)); }}
                        />
                        <BotonPapelera
                          etiqueta={`Eliminar el turno de ${t.especialidad}`}
                          onClick={() => { cerrarEdicionSinRuta(); setBorrando(t.id); }}
                        />
                      </>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}

      {abierto && (
        <DetalleTurno key={abierto.id} turno={abierto} perfil={perfil} puedeEditar={puedeEditar}
          onEditar={() => {
            const t = abierto;
            setAbierto(null);
            setBorrando(null);
            setEditandoId(t.id);
            setForm(aForm(t));
          }}
          onCerrar={() => setAbierto(null)}
        />
      )}

      <ErrorGuardarSheet
        abierto={error !== null}
        detalle={error?.detalle}
        reintentando={pendiente}
        onReintentar={() => error?.reintentar()}
        onDescartar={() => error?.descartar()}
        onCerrar={() => setError(null)}
      />
    </>
  );
}

// Edición en la fila con las mismas piezas del alta (pills de especialidad,
// franja de días y la fila "Hora del turno" que abre el selector de hora).
function FormEdicionTurno({
  form,
  onCambio,
  pendiente,
  onGuardar,
  onCancelar,
}: {
  form: DatosEdicionTurno;
  onCambio: (f: DatosEdicionTurno) => void;
  pendiente: boolean;
  onGuardar: () => void;
  onCancelar: () => void;
}) {
  const [pickerAbierto, setPickerAbierto] = useState(false);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onGuardar();
      }}
      className="flex flex-col gap-3.5 bg-canvas/30 p-4"
    >
      <div className="flex flex-col gap-2">
        <span className="eyebrow pl-1 text-subtle">Especialidad</span>
        <PillsEspecialidad valor={form.especialidad} onCambio={(v) => onCambio({ ...form, especialidad: v })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <CampoPill etiqueta="Profesional">
          <input value={form.profesional} onChange={(e) => onCambio({ ...form, profesional: e.target.value })} placeholder="ej. Dra. Paz" className={CLASE_INPUT_PILL} />
        </CampoPill>
        <CampoPill etiqueta="Lugar">
          <input value={form.lugar} onChange={(e) => onCambio({ ...form, lugar: e.target.value })} placeholder="ej. Sanatorio Norte" className={CLASE_INPUT_PILL} />
        </CampoPill>
      </div>
      {form.direccion !== undefined && (
        <CampoPill etiqueta="Dirección">
          <input value={form.direccion} onChange={(e) => onCambio({ ...form, direccion: e.target.value })} placeholder="ej. Av. Cabildo 2450" className={CLASE_INPUT_PILL} />
        </CampoPill>
      )}
      {form.telefono !== undefined && (
        <CampoPill etiqueta="Teléfono del consultorio">
          <input value={form.telefono} onChange={(e) => onCambio({ ...form, telefono: e.target.value })} placeholder="ej. 11 4444 5555" inputMode="tel" className={CLASE_INPUT_PILL} />
        </CampoPill>
      )}
      <div className="flex flex-col gap-2">
        <span className="eyebrow pl-1 text-subtle">Día</span>
        <FranjaDias valor={form.fecha} onCambio={(f) => onCambio({ ...form, fecha: f })} />
        <FilaHora etiqueta="Hora del turno" hora={form.hora} placeholderRelacion={null} onClick={() => setPickerAbierto(true)} />
      </div>
      <CampoPill etiqueta="Indicación">
        <input value={form.notas} onChange={(e) => onCambio({ ...form, notas: e.target.value })} placeholder="ej. Llevar estudios" className={CLASE_INPUT_PILL} />
      </CampoPill>
      <SelectorHora
        abierto={pickerAbierto}
        hora={form.hora}
        conComidas={false}
        onCerrar={() => setPickerAbierto(false)}
        onConfirmar={(h) => {
          onCambio({ ...form, hora: h });
          setPickerAbierto(false);
        }}
      />
      <BotonesGuardar pendiente={pendiente} deshabilitado={!form.especialidad.trim() || !form.fecha || !form.hora} onCancelar={onCancelar} />
    </form>
  );
}
