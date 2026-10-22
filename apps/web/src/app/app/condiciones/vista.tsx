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
} from "@/components/vita/edicion-lista";
import { cn } from "@/lib/utils";
import { metaDeCondicion, type Condicion } from "@/lib/perfil/tipos";
import {
  agregarItemAction,
  editarAlergiaAction,
  editarCondicionAction,
  quitarItemAction,
} from "./actions";
import type { EstadoAccion } from "../rutina/actions";

type Tab = "cond" | "alergias";
type Edicion = { tab: Tab; original: string; label: string; detalle: string };
type ErrorSheet = { detalle: string; reintentar: () => void; descartar: () => void } | null;

const SUGERENCIAS: Record<Tab, string[]> = {
  cond: ["Asma", "Diabetes tipo 2", "Hipotiroidismo", "Migraña"],
  alergias: ["Ibuprofeno", "Frutos secos", "Ácaros", "Mariscos"],
};

export function CondicionesView({
  condiciones,
  alergias,
  puedeEditar,
}: {
  condiciones: Condicion[];
  alergias: string[];
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("cond");
  const [edicion, setEdicion] = useState<Edicion | null>(null);
  const [nuevo, setNuevo] = useState("");
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<ErrorSheet>(null);

  const esCond = tab === "cond";
  const filas = esCond
    ? condiciones.map((c) => ({ clave: c.label, label: c.label, meta: metaDeCondicion(c) }))
    : alergias.map((a) => ({ clave: a, label: a, meta: "Alergia registrada" }));
  const presentes = new Set(filas.map((f) => f.label.toLowerCase()));
  const sugeridas = SUGERENCIAS[tab].filter((s) => !presentes.has(s.toLowerCase()));

  function correr(accion: () => Promise<EstadoAccion>, exito: string, alFinal?: () => void, reintento?: () => void) {
    startTransition(async () => {
      const r = await accion();
      if (r.status === "success") {
        toast.success(exito);
        setError(null);
        alFinal?.();
        router.refresh();
      } else {
        setError({
          detalle: r.status === "error" ? r.message : "No se pudo guardar.",
          reintentar: reintento ?? (() => correr(accion, exito, alFinal)),
          descartar: () => { setError(null); setEdicion(null); },
        });
      }
    });
  }

  function agregar() {
    const texto = nuevo.trim();
    if (!texto) return;
    correr(() => agregarItemAction(tab, texto), `${esCond ? "Condición" : "Alergia"} agregada`, () => setNuevo(""));
  }

  function guardar(e: Edicion) {
    correr(
      () => (e.tab === "cond" ? editarCondicionAction(e.original, e.label, e.detalle) : editarAlergiaAction(e.original, e.label)),
      "Cambios guardados",
      () => setEdicion(null)
    );
  }

  return (
    <>
      <div role="tablist" className="flex rounded-full bg-secondary p-1">
        {(
          [
            ["cond", "Condiciones"],
            ["alergias", "Alergias"],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => { setTab(k); setNuevo(""); setEdicion(null); }}
            className={cn(
              "flex-1 rounded-full px-3 py-2.5 text-[13px] font-bold transition-all motion-reduce:transition-none",
              tab === k ? "bg-card text-teal-deep shadow-item" : "text-subtle"
            )}
          >
            {l}
          </button>
        ))}
      </div>

      <ul className="overflow-hidden rounded-[20px] bg-card shadow-card">
        {filas.length === 0 && (
          <li className="px-4 py-[22px] text-center text-[13.5px] font-semibold text-subtle">
            {esCond ? "Todavía no cargaste ninguna condición." : "Todavía no cargaste ninguna alergia."}
          </li>
        )}
        {filas.map((f, i) => {
          const editando = edicion?.tab === tab && edicion.original === f.clave;
          return (
            <li key={f.clave} className={i > 0 ? "border-t border-foreground/[0.06]" : ""}>
              {editando && edicion ? (
                <form
                  onSubmit={(ev) => {
                    ev.preventDefault();
                    guardar(edicion);
                  }}
                  className="flex flex-col gap-3 bg-canvas/30 p-4"
                >
                  <CampoPill etiqueta={esCond ? "Condición" : "Alergia"}>
                    <input value={edicion.label} onChange={(ev) => setEdicion({ ...edicion, label: ev.target.value })} className={CLASE_INPUT_PILL} />
                  </CampoPill>
                  {esCond && (
                    <CampoPill etiqueta="Detalle">
                      <input
                        value={edicion.detalle}
                        onChange={(ev) => setEdicion({ ...edicion, detalle: ev.target.value })}
                        placeholder="ej. Permanente · desde 2021"
                        className={CLASE_INPUT_PILL}
                      />
                    </CampoPill>
                  )}
                  <BotonesGuardar pendiente={pendiente} deshabilitado={!edicion.label.trim()} onCancelar={() => setEdicion(null)} />
                </form>
              ) : (
                <div className="flex items-center gap-[13px] px-4 py-[15px]">
                  <div className="min-w-0 flex-1">
                    <div className={cn("font-heading text-[14.5px] font-extrabold tracking-[-0.02em]", !esCond && "text-chip-rose-ink")}>{f.label}</div>
                    <div className="mt-[3px] text-[12.5px] font-medium text-slate-brand">{f.meta}</div>
                  </div>
                  {puedeEditar && (
                    <>
                      <BotonLapiz
                        etiqueta={`Editar ${f.label}`}
                        onClick={() => setEdicion({ tab, original: f.clave, label: f.label, detalle: esCond ? f.meta : "" })}
                      />
                      <BotonPapelera
                        etiqueta={`Quitar ${f.label}`}
                        onClick={() => correr(() => quitarItemAction(tab, f.clave), `${f.label} quitada`)}
                      />
                    </>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {puedeEditar && (
        <div className="rounded-[20px] bg-card p-4 shadow-card">
          <div className="eyebrow text-subtle">Agregar {esCond ? "condición" : "alergia"}</div>
          <form
            onSubmit={(ev) => {
              ev.preventDefault();
              agregar();
            }}
            className="mt-3 flex gap-[9px]"
          >
            <input
              value={nuevo}
              onChange={(ev) => setNuevo(ev.target.value)}
              placeholder={esCond ? "ej. Asma" : "ej. Ibuprofeno"}
              className={cn(CLASE_INPUT_PILL, "min-w-0 flex-1 py-3 text-[14px]")}
            />
            <button
              type="submit"
              disabled={pendiente || !nuevo.trim()}
              className="rounded-full bg-primary px-5 text-[13.5px] font-bold text-primary-foreground shadow-cta disabled:opacity-60"
            >
              Agregar
            </button>
          </form>
          {sugeridas.length > 0 && (
            <div className="mt-[13px] flex flex-wrap gap-[7px]">
              {sugeridas.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setNuevo(s)}
                  className="rounded-lg border border-foreground/[0.12] bg-card px-2.5 py-1.5 text-[13px] font-semibold text-foreground/80 hover:border-foreground/30"
                >
                  + {s}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex items-stretch gap-[11px] px-1">
        <div className="min-h-[38px] w-[3px] rounded-[3px] bg-primary" />
        <p className="text-[12.5px] font-medium leading-[1.5] text-slate-brand">
          Vita cruza esto con tus medicamentos y te avisa si hay una interacción o una contraindicación.
        </p>
      </div>

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
