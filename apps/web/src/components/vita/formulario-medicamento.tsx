"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import type { EstadoAccion } from "@/app/app/rutina/actions";
import { useVolver } from "@/lib/navegacion/rastreador";
import { ErrorGuardarSheet } from "@/components/vita/error-guardar-sheet";
import { EditorTomas } from "@/components/vita/editor-tomas";
import { CampoMedicamento } from "@/components/vita/campo-medicamento";
import { VitaIcon } from "@/lib/vita-icons";
import { cn } from "@/lib/utils";
import { separarDosis } from "@/lib/inventario/tipos";
import {
  ajustarTomas,
  cantidadDeTomas,
  FRECUENCIAS_MEDICAMENTO,
  textoRecordatorio,
  type TomaForm,
} from "@/lib/medicamentos/comidas";

// Formulario de alta de medicamento (V7 D:2140): nombre, dosis, frecuencia,
// "Horarios" (una fila por toma que abre el selector de hora) y la línea
// "Vita te recuerda a las…". Lo comparten el alta propia/familiar y la del
// cuidador; cada una aporta su Server Action.


export type InicialMedicamento = {
  nombre: string;
  dosis: string;
  unidad: string;
  /** Stock contado por foto en "Mis pastillas"; "" si no viene de ahí. */
  stockInicial: string;
  pastillasPorToma: string;
};

export function FormularioMedicamento({
  accion,
  inicial,
  etiquetaGuardar,
  onExito,
  volverA = "/app/rutina",
  mostrarContar = false,
}: {
  accion: (prev: EstadoAccion, formData: FormData) => Promise<EstadoAccion>;
  inicial?: InicialMedicamento;
  etiquetaGuardar: string;
  onExito?: () => void;
  /** Destino de Cancelar/Descartar sin historial dentro de la app. */
  volverA?: string;
  /** Ofrece "Contar pastillas con foto" (solo para el perfil activo, no para el alta del cuidador). */
  mostrarContar?: boolean;
}) {
  const volver = useVolver(volverA);
  const [nombre, setNombre] = useState(inicial?.nombre ?? "");
  const [dosisTexto, setDosisTexto] = useState(
    inicial?.dosis ? `${inicial.dosis} ${inicial.unidad}`.trim() : ""
  );
  const [frecuencia, setFrecuencia] = useState<string>(FRECUENCIAS_MEDICAMENTO[0]);
  const [tomas, setTomas] = useState<TomaForm[]>(() => ajustarTomas([], 1));

  async function ejecutar(prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
    const resultado = await accion(prev, formData);
    if (resultado.status === "success") onExito?.();
    return resultado;
  }

  const [estado, formAction, pendiente] = useActionState(ejecutar, { status: "idle" } as EstadoAccion);
  const formRef = useRef<HTMLFormElement>(null);
  const [ocultoPara, setOcultoPara] = useState<EstadoAccion | null>(null);

  const horas = tomas.map((t) => t.hora);
  const repetidas = new Set(horas).size !== horas.length;
  const puedeGuardar = nombre.trim() !== "" && !repetidas;

  // "500 mg" -> dosis "500" + unidad "mg"; si no se entiende la unidad queda el texto entero.
  const dosis = separarDosis(dosisTexto);
  const dosisEnviada = dosis.valor;
  const unidadEnviada = dosis.unidad ?? inicial?.unidad ?? "mg";

  function elegirFrecuencia(f: string) {
    setFrecuencia(f);
    setTomas((prev) => ajustarTomas(prev, cantidadDeTomas(f)));
  }

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-[22px] pb-24">
      {inicial?.stockInicial && (
        <>
          <input type="hidden" name="stockInicial" value={inicial.stockInicial} />
          <input type="hidden" name="pastillasPorToma" value={inicial.pastillasPorToma} />
          <p className="rounded-[14px] bg-chip-teal-bg px-3.5 py-2.5 text-[13px] font-semibold text-chip-teal-ink">
            Se guardan también las {inicial.stockInicial} pastillas que contaste en el blister.
          </p>
        </>
      )}

      <div>
        <Etiqueta text="Nombre" />
        <div className="mt-3.5 flex items-center gap-3 rounded-full bg-card py-1 pl-[18px] pr-1.5 shadow-item">
          <VitaIcon name="pill" size={18} className="shrink-0 text-subtle" />
          <CampoMedicamento
            name="nombre"
            value={nombre}
            onChange={setNombre}
            placeholder="Ibupirac, Metformina…"
            ariaLabel="Nombre del medicamento"
          />
        </div>
        <input
          value={dosisTexto}
          onChange={(e) => setDosisTexto(e.target.value)}
          placeholder="500 mg"
          aria-label="Dosis"
          autoComplete="off"
          className="mt-3 w-full rounded-full border border-foreground/10 bg-card px-[18px] py-[13px] text-sm font-semibold outline-none placeholder:font-medium placeholder:text-faint focus-visible:ring-2 focus-visible:ring-primary/40"
        />
        <input type="hidden" name="dosis" value={dosisEnviada} />
        <input type="hidden" name="unidad" value={unidadEnviada} />
      </div>

      {mostrarContar && (
        <Link
          href={`/app/pastillas/contar?desde=agregar${nombre.trim() ? `&nombre=${encodeURIComponent(nombre.trim().slice(0, 80))}` : ""}`}
          className="flex items-center gap-3 rounded-[20px] bg-card p-[13px] shadow-item transition-transform active:scale-[0.99] motion-reduce:transition-none"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-[13px] bg-chip-teal-bg text-chip-teal-ink">
            <VitaIcon name="camera" size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-heading text-[14.5px] font-extrabold tracking-[-0.02em]">Contar pastillas con foto</span>
            <span className="mt-0.5 block text-[11.5px] font-medium text-subtle">Sacale una foto al blister y llevá el stock</span>
          </span>
          <VitaIcon name="chevron-right" size={18} className="shrink-0 text-faint" />
        </Link>
      )}

      <div>
        <Etiqueta text="Frecuencia" />
        <div className="mt-3.5 flex flex-wrap gap-2">
          {FRECUENCIAS_MEDICAMENTO.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => elegirFrecuencia(f)}
              className={cn(
                "rounded-full px-[17px] py-[11px] text-[13.5px] font-bold transition-all motion-reduce:transition-none",
                frecuencia === f ? "bg-ink text-background" : "bg-card text-slate-brand shadow-item"
              )}
            >
              {f}
            </button>
          ))}
        </div>
        <input type="hidden" name="frecuencia" value={frecuencia} />
      </div>

      <div>
        <div className="flex items-baseline justify-between border-b border-foreground/[0.07] pb-2.5">
          <div className="eyebrow text-subtle">Horarios</div>
          <div className="eyebrow text-faint">{frecuencia === "Única vez" ? "Una vez" : "Cada día"}</div>
        </div>
        <div className="mt-3.5">
          <EditorTomas tomas={tomas} onCambio={setTomas} />
        </div>
        {tomas.map((t, i) => (
          <span key={i} hidden>
            <input type="hidden" name="tomaHora" value={t.hora} />
            <input type="hidden" name="tomaComida" value={t.conComida} />
            <input type="hidden" name="tomaIndicacion" value={t.indicacion ?? ""} />
          </span>
        ))}
        <div className="mt-4 flex items-start gap-[11px]">
          <div aria-hidden className="min-h-[34px] w-[3px] self-stretch rounded bg-primary" />
          <div className="text-[12.5px] font-medium leading-normal text-slate-brand">{textoRecordatorio(horas, frecuencia)}</div>
        </div>
      </div>

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
          {pendiente ? "Guardando…" : etiquetaGuardar}
        </button>
      </div>
    </form>
  );
}

function Etiqueta({ text }: { text: string }) {
  return <div className="eyebrow border-b border-foreground/[0.07] pb-2.5 text-subtle">{text}</div>;
}
