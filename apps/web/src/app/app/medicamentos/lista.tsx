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
import { CampoMedicamento } from "@/components/vita/campo-medicamento";
import { FilaCuando, FilaStock, HojaCuando, HojaCuantoQueda, SelectForma } from "@/components/vita/campos-medicamento";
import type { TomaForm } from "@/lib/medicamentos/comidas";
import { fechaFinDe, fechaHoyAR, tratamientoTerminado, type CuandoForm } from "@/lib/medicamentos/cuando";
import { CONFIG_FORMA, consumoDeToma, frecuenciaDeTomas, seCuentaConFoto, type FormaMedicamento } from "@/lib/medicamentos/forma";
import { indicacionDeComida, textoDosis, type Medicamento } from "@/lib/medicamentos/tipos";
import { separarDosis } from "@/lib/inventario/tipos";
import { colorChipPorIndice, type ColorChip } from "@/lib/perfil/tipos";
import type { PerfilActivo } from "@/lib/familia/tipos";
import type { DatosDetalleMedicamento } from "@/lib/rutina/detalle-datos";
import { DetalleMedicamentoHost } from "../rutina/detalle-medicamento-host";
import { eliminarMedicamentoGrupoAction, guardarMedicamentoAction } from "./actions";

// Lista de "Mis medicamentos" con edición en la fila (V7): misma carga por toma
// que el alta (`EditorTomas`, `campos-medicamento`).

type Grupo = { id: string; filas: Medicamento[] };

const TONO: Record<ColorChip, string> = {
  teal: "bg-chip-teal-bg text-chip-teal-ink",
  violet: "bg-chip-violet-bg text-chip-violet-ink",
  amber: "bg-chip-amber-bg text-chip-amber-ink",
  rose: "bg-chip-rose-bg text-chip-rose-ink",
};

/** Stock actual por id de fila, para precargar la edición. */
export type StockPorFila = Record<string, { stock: number; porToma: number }>;

type Edicion = {
  grupoId: string;
  nombre: string;
  droga: string;
  dosis: string;
  forma: FormaMedicamento;
  tomas: TomaForm[];
  cuando: CuandoForm;
  cuandoTocado: boolean;
  stock: number | null;
  stockTocado: boolean;
};

type ErrorSheet = { detalle: string; reintentar: () => void; descartar: () => void } | null;

function edicionDe(grupo: Grupo, stocks: StockPorFila): Edicion {
  const primera = grupo.filas[0];
  const forma = primera.forma ?? "pastilla";
  const guardado = stocks[primera.id];
  const cantidadVieja = forma === "pastilla" && guardado ? guardado.porToma : CONFIG_FORMA[forma].porDefecto;
  return {
    grupoId: grupo.id,
    nombre: primera.nombre,
    droga: primera.droga ?? "",
    dosis: textoDosis(primera),
    forma,
    tomas: grupo.filas.map((f) => ({ id: f.id, hora: f.hora_programada.slice(0, 5), conComida: f.con_comida, indicacion: f.indicacion ?? null, cantidad: f.cantidad_por_toma ?? cantidadVieja })),
    cuando: { dias: primera.dias_recurrentes, hasta: primera.fecha_fin ? "fecha" : "siempre", fechaElegida: primera.fecha_fin?.slice(0, 10) ?? "" },
    cuandoTocado: false,
    stock: guardado?.stock ?? null,
    stockTocado: false,
  };
}

function resumenFila(filas: Medicamento[], hoy: string): string {
  const horas = filas.map((f) => f.hora_programada.slice(0, 5)).join(" y ");
  const indicaciones = [...new Set(filas.map((f) => indicacionDeComida(f)).filter((x): x is string => !!x))];
  return [
    filas[0].droga ?? null,
    tratamientoTerminado(filas, hoy) ? "Terminado" : null,
    textoDosis(filas[0]),
    `${horas} hs`,
    indicaciones.length ? indicaciones.join(" · ") : "Sin indicación cargada",
  ]
    .filter(Boolean)
    .join(" · ");
}

export function ListaMedicamentos({
  grupos,
  editarInicial,
  puedeEditar,
  perfil,
  detalle,
  stocks,
}: {
  grupos: Grupo[];
  editarInicial?: string;
  puedeEditar: boolean;
  perfil: PerfilActivo;
  detalle: DatosDetalleMedicamento;
  stocks: StockPorFila;
}) {
  const router = useRouter();
  const hoy = fechaHoyAR();
  const [edicion, setEdicion] = useState<Edicion | null>(() => {
    const g = grupos.find((x) => x.id === editarInicial);
    return g ? edicionDe(g, stocks) : null;
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
          droga: e.droga,
          dosis,
          unidad,
          // La frecuencia es descriptiva: solo se actualiza si cambió la cantidad de tomas.
          frecuencia: e.tomas.length !== grupo.filas.length ? frecuenciaDeTomas(e.tomas.length) : undefined,
          forma: e.forma,
          // Sin tocar "Cuándo" no se reescribe: filas viejas pueden tener días distintos.
          diasRecurrentes: e.cuandoTocado ? e.cuando.dias : undefined,
          fechaFin: e.cuandoTocado ? fechaFinDe(e.cuando, fechaHoyAR()) : undefined,
          tomas: e.tomas,
        },
        e.stockTocado && e.stock !== null ? e.stock : undefined
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
                      <div className="mt-0.5 text-[11.5px] font-medium leading-snug text-subtle">{resumenFila(g.filas, hoy)}</div>
                    </div>
                  </button>
                  {puedeEditar && (
                    <>
                      {seCuentaConFoto(g.filas[0].forma) && (
                        <Link
                          href={`/app/pastillas/contar?medicamento=${g.filas[0].id}&desde=medicamentos`}
                          aria-label={`Contar pastillas de ${nombre}`}
                          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-canvas/60 text-slate-brand transition-colors hover:bg-canvas"
                        >
                          <VitaIcon name="camera" size={14} strokeWidth={2.2} />
                        </Link>
                      )}
                      <BotonLapiz etiqueta={`Editar ${nombre}`} onClick={() => { setBorrando(null); setEdicion(edicionDe(g, stocks)); }} />
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
            setEdicion(edicionDe(g, stocks));
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
  const [hojaCuando, setHojaCuando] = useState(false);
  const [hojaStock, setHojaStock] = useState(false);
  const config = CONFIG_FORMA[edicion.forma];
  const consumoPorDia =
    edicion.tomas.reduce((total, t) => total + consumoDeToma(edicion.forma, t.cantidad ?? config.porDefecto), 0) *
    (edicion.cuando.dias.length > 0 ? edicion.cuando.dias.length / 7 : 1);

  function cambiarForma(forma: FormaMedicamento) {
    if (forma === edicion.forma) return;
    onCambio({
      ...edicion,
      forma,
      stock: null,
      stockTocado: false,
      tomas: edicion.tomas.map((t) => ({ ...t, cantidad: CONFIG_FORMA[forma].porDefecto })),
    });
  }

  const horasRepetidas = new Set(edicion.tomas.map((t) => t.hora)).size !== edicion.tomas.length;
  const faltaFecha = edicion.cuando.hasta === "fecha" && !edicion.cuando.fechaElegida;
  const puedeGuardar = edicion.nombre.trim() !== "" && edicion.tomas.every((t) => t.hora) && !horasRepetidas && !faltaFecha;

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
          <CampoMedicamento
            variante="pill"
            value={edicion.nombre}
            onChange={(nombre) => onCambio({ ...edicion, nombre })}
            onElegir={({ nombre, droga }) => onCambio({ ...edicion, nombre, droga: droga ?? "" })}
            ariaLabel="Nombre del medicamento"
          />
        </CampoPill>
        <CampoPill etiqueta="Dosis">
          <input value={edicion.dosis} onChange={(e) => onCambio({ ...edicion, dosis: e.target.value })} placeholder={config.placeholderDosis} className={CLASE_INPUT_PILL} />
        </CampoPill>
      </div>

      <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-2">
        <CampoPill etiqueta="Droga">
          <input
            value={edicion.droga}
            onChange={(e) => onCambio({ ...edicion, droga: e.target.value })}
            placeholder="Opcional"
            maxLength={80}
            className={CLASE_INPUT_PILL}
          />
        </CampoPill>
        <CampoPill etiqueta="Forma">
          <SelectForma valor={edicion.forma} onCambio={cambiarForma} className={CLASE_INPUT_PILL} />
        </CampoPill>
      </div>

      <div className="flex flex-col gap-2">
        <span className="eyebrow pl-1 text-subtle">Horarios</span>
        <EditorTomas tomas={edicion.tomas} onCambio={(tomas) => onCambio({ ...edicion, tomas })} forma={edicion.forma} />
      </div>

      <FilaCuando cuando={edicion.cuando} onClick={() => setHojaCuando(true)} />
      {/* A mano: contar con foto sale de la edición y perdía los cambios; se cuenta desde la fila (cámara). */}
      <FilaStock forma={edicion.forma} stock={edicion.stock} consumoPorDia={consumoPorDia} onClick={() => setHojaStock(true)} />
      <HojaCuando
        abierto={hojaCuando}
        valor={edicion.cuando}
        onCambio={(cuando) => onCambio({ ...edicion, cuando, cuandoTocado: true })}
        onCerrar={() => setHojaCuando(false)}
      />
      <HojaCuantoQueda
        abierto={hojaStock}
        forma={edicion.forma}
        valor={edicion.stock}
        onConfirmar={(stock) => {
          onCambio({ ...edicion, stock, stockTocado: true });
          setHojaStock(false);
        }}
        onCerrar={() => setHojaStock(false)}
      />

      <BotonesGuardar pendiente={pendiente} deshabilitado={!puedeGuardar} onCancelar={onCancelar} />
    </form>
  );
}
