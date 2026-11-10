"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ErrorGuardarSheet } from "@/components/vita/error-guardar-sheet";
import { BotonLapiz, BotonPapelera, ConfirmarEliminar } from "@/components/vita/edicion-lista";
import { VitaIcon } from "@/lib/vita-icons";
import { etiquetaDia, formatoFechaCorta } from "@/lib/rutina/formato";
import { iconoDeEspecialidad, tonoDeTurno } from "@/lib/turnos/icono";
import type { Turno } from "@/lib/turnos/tipos";
import type { PerfilActivo } from "@/lib/familia/tipos";
import { DetalleTurno } from "../rutina/detalle-turno";
import { eliminarTurnoAction } from "./actions";

type ErrorSheet = { detalle: string; reintentar: () => void; descartar: () => void } | null;

function cuando(t: Turno): string {
  const dia = etiquetaDia(t.fecha);
  return `${dia === "Hoy" || dia === "Mañana" ? dia : formatoFechaCorta(t.fecha)} a las ${t.hora.slice(0, 5)}`;
}

// Lista de "Mis turnos": el lápiz abre /app/turnos/[id]/editar, que es la
// misma pantalla del alta con el turno cargado (components/vita/formulario-turno).
export function ListaTurnos({
  turnos,
  puedeEditar,
  perfil,
}: {
  turnos: Turno[];
  puedeEditar: boolean;
  perfil: PerfilActivo;
}) {
  const router = useRouter();
  const editar = (t: Turno) => router.push(`/app/turnos/${t.id}/editar`);
  const [borrando, setBorrando] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<Turno | null>(null);
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<ErrorSheet>(null);

  const porFecha = new Map<string, Turno[]>();
  for (const t of turnos) {
    if (!porFecha.has(t.fecha)) porFecha.set(t.fecha, []);
    porFecha.get(t.fecha)!.push(t);
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
                {borrando === t.id ? (
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
                          onClick={() => editar(t)}
                        />
                        <BotonPapelera
                          etiqueta={`Eliminar el turno de ${t.especialidad}`}
                          onClick={() => setBorrando(t.id)}
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
          onEditar={() => editar(abierto)}
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
