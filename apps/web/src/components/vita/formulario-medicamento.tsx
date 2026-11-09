"use client";

import { useActionState, useRef, useState } from "react";
import type { EstadoAccion } from "@/app/app/rutina/actions";
import { useVolver } from "@/lib/navegacion/rastreador";
import { ErrorGuardarSheet } from "@/components/vita/error-guardar-sheet";
import { EditorTomas } from "@/components/vita/editor-tomas";
import { CampoMedicamento } from "@/components/vita/campo-medicamento";
import { VitaIcon } from "@/lib/vita-icons";
import { cn } from "@/lib/utils";
import { separarDosis } from "@/lib/inventario/tipos";
import { FilaCuando, FilaStock, HojaCuando, HojaCuantoQueda, SelectForma } from "@/components/vita/campos-medicamento";
import { ajustarTomas, type TomaForm } from "@/lib/medicamentos/comidas";
import { CUANDO_INICIAL, fechaFinDe, fechaHoyAR, type CuandoForm } from "@/lib/medicamentos/cuando";
import {
  adivinarForma,
  CONFIG_FORMA,
  consumoDeToma,
  frecuenciaDeTomas,
  type FormaMedicamento,
} from "@/lib/medicamentos/forma";

// Formulario de alta de medicamento (V7): nombre, dosis y forma, "Horarios"
// (una tarjeta por toma con su cantidad), "Cuándo" y stock. Lo comparten el
// alta propia/familiar y la del cuidador; cada una aporta su Server Action.


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
  const [forma, setForma] = useState<FormaMedicamento>("pastilla");
  const [formaTocada, setFormaTocada] = useState(false);
  const [tomas, setTomas] = useState<TomaForm[]>(() => {
    const porToma = Number(inicial?.pastillasPorToma);
    const valida = porToma >= CONFIG_FORMA.pastilla.minimo && porToma <= CONFIG_FORMA.pastilla.maximo;
    return ajustarTomas([], 1).map((t) => ({ ...t, cantidad: valida ? porToma : CONFIG_FORMA.pastilla.porDefecto }));
  });
  const [cuando, setCuando] = useState<CuandoForm>(CUANDO_INICIAL);
  const [hojaCuando, setHojaCuando] = useState(false);
  const [hojaStock, setHojaStock] = useState(false);
  const [stock, setStock] = useState<number | null>(inicial?.stockInicial ? Number(inicial.stockInicial) : null);

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
  const fechaFin = fechaFinDe(cuando, fechaHoyAR());
  const puedeGuardar = nombre.trim() !== "" && !repetidas && (cuando.hasta !== "fecha" || fechaFin !== null);
  const config = CONFIG_FORMA[forma];
  const consumoPorDia =
    tomas.reduce((total, t) => total + consumoDeToma(forma, t.cantidad ?? config.porDefecto), 0) *
    (cuando.dias.length > 0 ? cuando.dias.length / 7 : 1);

  // "500 mg" -> dosis "500" + unidad "mg"; si no se entiende la unidad queda el texto entero.
  const dosis = separarDosis(dosisTexto);
  const dosisEnviada = dosis.valor;
  const unidadEnviada = dosis.unidad ?? inicial?.unidad ?? "mg";

  // Otra forma es otra unidad: las cantidades y el stock cargados dejan de valer.
  function cambiarForma(nueva: FormaMedicamento) {
    if (nueva === forma) return;
    setForma(nueva);
    setStock(null);
    setTomas((prev) => prev.map((t) => ({ ...t, cantidad: CONFIG_FORMA[nueva].porDefecto })));
  }

  function cambiarNombre(valor: string) {
    setNombre(valor);
    const sugerida = adivinarForma(valor);
    if (sugerida && !formaTocada) cambiarForma(sugerida);
  }

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-[22px] pb-24">
      <input type="hidden" name="forma" value={forma} />
      <input type="hidden" name="frecuencia" value={frecuenciaDeTomas(tomas.length)} />
      <input type="hidden" name="fechaFin" value={fechaFin ?? ""} />
      {cuando.dias.map((d) => (
        <input key={d} type="hidden" name="dia" value={d} />
      ))}
      {stock !== null && (
        <>
          <input type="hidden" name="stockInicial" value={stock} />
          <input type="hidden" name="pastillasPorToma" value={inicial?.pastillasPorToma || "1"} />
        </>
      )}

      <div>
        <Etiqueta text="Nombre" />
        <div className="mt-3.5 flex items-center gap-3 rounded-full bg-card py-1 pl-[18px] pr-1.5 shadow-item">
          <VitaIcon name="pill" size={18} className="shrink-0 text-subtle" />
          <CampoMedicamento
            name="nombre"
            value={nombre}
            onChange={cambiarNombre}
            placeholder="Ibupirac, Metformina…"
            ariaLabel="Nombre del medicamento"
          />
        </div>
        <div className="mt-3 flex gap-[9px]">
          <input
            value={dosisTexto}
            onChange={(e) => setDosisTexto(e.target.value)}
            placeholder={config.placeholderDosis}
            aria-label="Dosis"
            autoComplete="off"
            className="min-w-0 flex-1 rounded-full border border-foreground/10 bg-card px-[18px] py-[13px] text-sm font-semibold outline-none placeholder:font-medium placeholder:text-faint focus-visible:ring-2 focus-visible:ring-primary/40"
          />
          <div className="w-[138px] shrink-0">
            <SelectForma
              valor={forma}
              onCambio={(f) => {
                setFormaTocada(true);
                cambiarForma(f);
              }}
              className="w-full rounded-full border border-foreground/10 bg-card py-[13px] pl-[18px] text-sm font-bold outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            />
          </div>
        </div>
        <input type="hidden" name="dosis" value={dosisEnviada} />
        <input type="hidden" name="unidad" value={unidadEnviada} />
      </div>

      <div>
        <div className="border-b border-foreground/[0.07] pb-2.5">
          <div className="eyebrow text-subtle">Horarios</div>
        </div>
        <div className="mt-3.5">
          <EditorTomas tomas={tomas} onCambio={setTomas} forma={forma} />
        </div>
        {tomas.map((t, i) => (
          <span key={i} hidden>
            <input type="hidden" name="tomaHora" value={t.hora} />
            <input type="hidden" name="tomaComida" value={t.conComida} />
            <input type="hidden" name="tomaIndicacion" value={t.indicacion ?? ""} />
            <input type="hidden" name="tomaCantidad" value={t.cantidad ?? config.porDefecto} />
          </span>
        ))}
      </div>

      <FilaCuando cuando={cuando} onClick={() => setHojaCuando(true)} />
      {mostrarContar && (
        <FilaStock
          forma={forma}
          stock={stock}
          consumoPorDia={consumoPorDia}
          href={config.conFoto ? `/app/pastillas/contar?desde=agregar${nombre.trim() ? `&nombre=${encodeURIComponent(nombre.trim().slice(0, 80))}` : ""}` : undefined}
          onClick={() => setHojaStock(true)}
        />
      )}
      <HojaCuando abierto={hojaCuando} valor={cuando} onCambio={setCuando} onCerrar={() => setHojaCuando(false)} />
      <HojaCuantoQueda
        abierto={hojaStock}
        forma={forma}
        valor={stock}
        onConfirmar={(n) => {
          setStock(n);
          setHojaStock(false);
        }}
        onCerrar={() => setHojaStock(false)}
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
