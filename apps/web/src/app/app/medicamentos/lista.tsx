"use client";

import Link from "next/link";
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
import { cn } from "@/lib/utils";
import { EditorTomas } from "@/components/vita/editor-tomas";
import { ajustarTomas, cantidadDeTomas, FRECUENCIAS_MEDICAMENTO, type TomaForm } from "@/lib/medicamentos/comidas";
import { indicacionDeComida, textoDosis, type Medicamento } from "@/lib/medicamentos/tipos";
import { separarDosis } from "@/lib/inventario/tipos";
import { colorChipPorIndice, type ColorChip } from "@/lib/perfil/tipos";
import type { PerfilActivo } from "@/lib/familia/tipos";
import type { DatosDetalleMedicamento } from "@/lib/rutina/detalle-datos";
import { DetalleMedicamentoHost } from "../rutina/detalle-medicamento-host";
import { eliminarMedicamentoGrupoAction, guardarMedicamentoAction } from "./actions";

// Lista de "Mis medicamentos" con edición en la fila (V7 D:1985). Este form de
// edición es independiente del de alta: cuando el alta pase al modelo
// "horarios por toma" (paquete 6) conviene extraer de acá el editor de tomas
// (`EditorTomas`) y compartirlo.

type Grupo = { id: string; filas: Medicamento[] };

const TONO: Record<ColorChip, string> = {
  teal: "bg-chip-teal-bg text-chip-teal-ink",
  violet: "bg-chip-violet-bg text-chip-violet-ink",
  amber: "bg-chip-amber-bg text-chip-amber-ink",
  rose: "bg-chip-rose-bg text-chip-rose-ink",
};

const FRECUENCIAS = FRECUENCIAS_MEDICAMENTO;

type Edicion = {
  grupoId: string;
  nombre: string;
  dosis: string;
  frecuencia: string;
  frecuenciaTocada: boolean;
  tomas: TomaForm[];
};

type ErrorSheet = { detalle: string; reintentar: () => void; descartar: () => void } | null;

function frecuenciaInicial(filas: Medicamento[]): string {
  const guardada = filas[0].frecuencia ?? "";
  if ((FRECUENCIAS as readonly string[]).includes(guardada)) return guardada;
  return filas.length >= 3 ? "3x día" : filas.length === 2 ? "2x día" : "1x día";
}

function edicionDe(grupo: Grupo): Edicion {
  return {
    grupoId: grupo.id,
    nombre: grupo.filas[0].nombre,
    dosis: textoDosis(grupo.filas[0]),
    frecuencia: frecuenciaInicial(grupo.filas),
    frecuenciaTocada: false,
    tomas: grupo.filas.map((f) => ({ id: f.id, hora: f.hora_programada.slice(0, 5), conComida: f.con_comida, indicacion: f.indicacion ?? null })),
  };
}

function resumenFila(filas: Medicamento[]): string {
  const horas = filas.map((f) => f.hora_programada.slice(0, 5)).join(" y ");
  const indicaciones = [...new Set(filas.map((f) => indicacionDeComida(f)).filter((x): x is string => !!x))];
  return [textoDosis(filas[0]), `${horas} hs`, indicaciones.length ? indicaciones.join(" · ") : "Sin indicación cargada"]
    .filter(Boolean)
    .join(" · ");
}

export function ListaMedicamentos({
  grupos,
  editarInicial,
  puedeEditar,
  perfil,
  detalle,
}: {
  grupos: Grupo[];
  editarInicial?: string;
  puedeEditar: boolean;
  perfil: PerfilActivo;
  detalle: DatosDetalleMedicamento;
}) {
  const router = useRouter();
  const [edicion, setEdicion] = useState<Edicion | null>(() => {
    const g = grupos.find((x) => x.id === editarInicial);
    return g ? edicionDe(g) : null;
  });
  const [borrando, setBorrando] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<{ id: string; indice: number } | null>(null);
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<ErrorSheet>(null);

  function soltarParametro() {
    if (editarInicial) router.replace("/app/medicamentos");
  }

  function cerrarEdicion() {
    setEdicion(null);
    setError(null);
    soltarParametro();
  }

  function guardar(grupo: Grupo, e: Edicion) {
    const primera = grupo.filas[0];
    const textoOriginal = textoDosis(primera);
    let dosis = primera.dosis;
    let unidad = primera.unidad;
    if (e.dosis.trim() !== textoOriginal) {
      const sep = separarDosis(e.dosis);
      dosis = sep.valor || null;
      unidad = sep.unidad ?? primera.unidad;
    }
    startTransition(async () => {
      const r = await guardarMedicamentoAction(
        grupo.filas.map((f) => f.id),
        {
          nombre: e.nombre,
          dosis,
          unidad,
          frecuencia: e.frecuenciaTocada ? e.frecuencia : undefined,
          tomas: e.tomas,
        }
      );
      if (r.status === "success") {
        toast.success("Cambios guardados");
        cerrarEdicion();
        router.refresh();
      } else {
        setError({ detalle: r.status === "error" ? r.message : "No se pudo guardar.", reintentar: () => guardar(grupo, e), descartar: cerrarEdicion });
      }
    });
  }

  function eliminar(grupo: Grupo) {
    const nombre = grupo.filas[0].nombre;
    startTransition(async () => {
      const r = await eliminarMedicamentoGrupoAction(grupo.filas.map((f) => f.id));
      if (r.status === "success") {
        toast.success(`${nombre} eliminado`);
        setBorrando(null);
        setError(null);
        router.refresh();
      } else {
        setError({ detalle: r.status === "error" ? r.message : "No se pudo guardar.", reintentar: () => eliminar(grupo), descartar: () => { setBorrando(null); setError(null); } });
      }
    });
  }

  if (grupos.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-[20px] bg-card px-[18px] py-[22px] text-center shadow-card">
        <div className="text-[13.5px] font-semibold text-subtle">Todavía no cargaste ningún remedio.</div>
        {puedeEditar && (
          <Link href="/app/agregar-medicamento" className="rounded-full bg-primary px-[18px] py-[11px] text-[13.5px] font-extrabold text-primary-foreground">
            Agregar un remedio
          </Link>
        )}
      </div>
    );
  }

  return (
    <>
      <ul className="overflow-hidden rounded-[20px] bg-card shadow-card">
        {grupos.map((g, i) => {
          const editando = edicion?.grupoId === g.id;
          const eliminando = borrando === g.id;
          const nombre = g.filas[0].nombre;
          return (
            <li key={g.id} className={i > 0 ? "border-t border-foreground/[0.06]" : ""}>
              {editando && edicion ? (
                <FormEdicion
                  edicion={edicion}
                  onCambio={setEdicion}
                  pendiente={pendiente}
                  onGuardar={() => guardar(g, edicion)}
                  onCancelar={cerrarEdicion}
                />
              ) : eliminando ? (
                <ConfirmarEliminar
                  titulo={`¿Eliminar ${nombre}?`}
                  detalle="Se borra de la rutina y dejan de llegar sus avisos."
                  pendiente={pendiente}
                  onConfirmar={() => eliminar(g)}
                  onCancelar={() => setBorrando(null)}
                />
              ) : (
                <div className="flex items-center gap-3 py-3.5 pl-4 pr-3.5">
                  <button
                    type="button"
                    onClick={() => setAbierto({ id: g.filas[0].id, indice: i })}
                    aria-label={`${nombre}, ver detalle`}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-[13px]", TONO[colorChipPorIndice(i)])}>
                      <VitaIcon name="pill" size={19} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-heading text-[14.5px] font-extrabold tracking-[-0.02em]">{nombre}</div>
                      <div className="mt-0.5 text-[11.5px] font-medium leading-snug text-subtle">{resumenFila(g.filas)}</div>
                    </div>
                  </button>
                  {puedeEditar && (
                    <>
                      <BotonLapiz etiqueta={`Editar ${nombre}`} onClick={() => { setBorrando(null); setEdicion(edicionDe(g)); }} />
                      <BotonPapelera etiqueta={`Eliminar ${nombre}`} onClick={() => { setEdicion(null); setBorrando(g.id); }} />
                    </>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <DetalleMedicamentoHost
        abiertoId={abierto?.id ?? null}
        indiceColor={abierto?.indice ?? 0}
        datos={detalle}
        perfil={perfil}
        onEditar={(id) => {
          const g = grupos.find((x) => x.filas.some((f) => f.id === id));
          setAbierto(null);
          if (g) {
            setBorrando(null);
            setEdicion(edicionDe(g));
          }
        }}
        onCerrar={() => setAbierto(null)}
      />

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

function FormEdicion({
  edicion,
  onCambio,
  pendiente,
  onGuardar,
  onCancelar,
}: {
  edicion: Edicion;
  onCambio: (e: Edicion) => void;
  pendiente: boolean;
  onGuardar: () => void;
  onCancelar: () => void;
}) {
  function elegirFrecuencia(f: string) {
    const tomas = ajustarTomas(edicion.tomas, cantidadDeTomas(f));
    onCambio({ ...edicion, frecuencia: f, frecuenciaTocada: true, tomas });
  }

  const horasRepetidas = new Set(edicion.tomas.map((t) => t.hora)).size !== edicion.tomas.length;
  const puedeGuardar = edicion.nombre.trim() !== "" && edicion.tomas.every((t) => t.hora) && !horasRepetidas;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (puedeGuardar) onGuardar();
      }}
      className="flex flex-col gap-3 bg-canvas/30 p-4"
    >
      <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-2">
        <CampoPill etiqueta="Nombre">
          <input value={edicion.nombre} onChange={(e) => onCambio({ ...edicion, nombre: e.target.value })} className={CLASE_INPUT_PILL} />
        </CampoPill>
        <CampoPill etiqueta="Dosis">
          <input value={edicion.dosis} onChange={(e) => onCambio({ ...edicion, dosis: e.target.value })} placeholder="500 mg" className={CLASE_INPUT_PILL} />
        </CampoPill>
      </div>

      <div className="flex flex-col gap-2">
        <span className="eyebrow pl-1 text-subtle">Frecuencia</span>
        <div className="flex flex-wrap gap-[7px]">
          {FRECUENCIAS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => elegirFrecuencia(f)}
              className={cn(
                "rounded-full px-3.5 py-[9px] text-[12.5px] font-bold transition-all motion-reduce:transition-none",
                edicion.frecuencia === f
                  ? "bg-ink text-background"
                  : "bg-card text-slate-brand shadow-item"
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="eyebrow pl-1 text-subtle">Horarios</span>
        <EditorTomas tomas={edicion.tomas} onCambio={(tomas) => onCambio({ ...edicion, tomas })} />
      </div>

      <BotonesGuardar pendiente={pendiente} deshabilitado={!puedeGuardar} onCancelar={onCancelar} />
    </form>
  );
}
