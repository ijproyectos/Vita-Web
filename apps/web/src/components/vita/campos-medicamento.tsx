"use client";

import Link from "next/link";
import { useState, type ComponentProps, type ReactNode } from "react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { VitaIcon } from "@/lib/vita-icons";
import { cn } from "@/lib/utils";
import {
  alternarDia,
  DIAS_CUANDO,
  fechaHoyAR,
  OPCIONES_HASTA,
  resumenCuando,
  type CuandoForm,
} from "@/lib/medicamentos/cuando";
import { CONFIG_FORMA, FORMAS, resumenStock, type FormaMedicamento } from "@/lib/medicamentos/forma";
import { STOCK_MAXIMO } from "@/lib/inventario/tipos";

// Piezas compartidas por el alta y la edición de medicamento (V7): selector de
// forma, filas "Cuándo" y de stock, y sus hojas.

export function SelectForma({
  valor,
  onCambio,
  className,
}: {
  valor: FormaMedicamento;
  onCambio: (forma: FormaMedicamento) => void;
  className: string;
}) {
  return (
    <div className="relative">
      <select value={valor} onChange={(e) => onCambio(e.target.value as FormaMedicamento)} aria-label="Forma" className={cn("appearance-none pr-[34px]", className)}>
        {FORMAS.map((f) => (
          <option key={f.clave} value={f.clave}>
            {f.etiqueta}
          </option>
        ))}
      </select>
      <VitaIcon name="chevron-down" size={14} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-subtle" />
    </div>
  );
}

function ContenidoFila({ icono, titulo, resumen, alerta }: { icono: ComponentProps<typeof VitaIcon>["name"]; titulo: string; resumen: string; alerta?: boolean }) {
  return (
    <>
      <VitaIcon name={icono} size={17} className="shrink-0 text-subtle" />
      <span className="min-w-0 flex-1">
        <span className="eyebrow block text-subtle">{titulo}</span>
        <span className={cn("mt-[3px] block font-heading text-[14.5px] font-extrabold tracking-[-0.02em]", alerta && "text-chip-amber-ink")}>{resumen}</span>
      </span>
      <VitaIcon name="chevron-right" size={16} className="shrink-0 text-faint" />
    </>
  );
}

const CLASE_FILA =
  "flex w-full items-center gap-3 rounded-[var(--radius-item)] bg-card px-[18px] py-[15px] text-left shadow-item transition-transform active:scale-[0.99] motion-reduce:transition-none";

export function FilaCuando({ cuando, onClick }: { cuando: CuandoForm; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={CLASE_FILA}>
      <ContenidoFila icono="calendar" titulo="Cuándo" resumen={resumenCuando(cuando, fechaHoyAR())} />
    </button>
  );
}

/** Fila de stock. La pastilla se cuenta con foto (`href`); lo demás se carga a mano (`onClick`). */
export function FilaStock({
  forma,
  stock,
  consumoPorDia,
  href,
  onClick,
}: {
  forma: FormaMedicamento;
  stock: number | null;
  consumoPorDia: number;
  href?: string;
  onClick?: () => void;
}) {
  const titulo = CONFIG_FORMA[forma].tituloStock;
  if (!titulo) return null;
  const { texto, alerta } = resumenStock(forma, stock, consumoPorDia);
  const contenido = <ContenidoFila icono="camera" titulo={titulo} resumen={texto} alerta={alerta} />;
  return href ? (
    <Link href={href} className={CLASE_FILA}>
      {contenido}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={CLASE_FILA}>
      {contenido}
    </button>
  );
}

function Hoja({ abierto, onCerrar, children }: { abierto: boolean; onCerrar: () => void; children: ReactNode }) {
  return (
    <Sheet open={abierto} onOpenChange={(v) => !v && onCerrar()}>
      <SheetContent side="bottom" showCloseButton={false} className="max-h-[92%] gap-0 overflow-y-auto rounded-t-[28px] bg-card px-5 pb-[34px] pt-3.5 [scrollbar-width:none]">
        <div aria-hidden className="mx-auto mb-[18px] h-1 w-10 shrink-0 rounded bg-line" />
        {children}
      </SheetContent>
    </Sheet>
  );
}

const claseOpcion = (activa: boolean) =>
  cn(
    "font-bold transition-all motion-reduce:transition-none",
    activa ? "bg-ink text-background" : "bg-card text-slate-brand shadow-item"
  );

const CLASE_BOTON_LISTO =
  "mt-[22px] w-full rounded-full bg-primary py-[17px] font-heading text-[15px] font-extrabold tracking-[-0.01em] text-primary-foreground shadow-[0_3px_10px_color-mix(in_srgb,var(--primary)_35%,transparent)] active:scale-[0.98] motion-reduce:transform-none";

export function HojaCuando({
  abierto,
  valor,
  onCambio,
  onCerrar,
}: {
  abierto: boolean;
  valor: CuandoForm;
  onCambio: (cuando: CuandoForm) => void;
  onCerrar: () => void;
}) {
  const [algunos, setAlgunos] = useState(false);
  const mostrarDias = algunos || valor.dias.length > 0;

  return (
    <Hoja abierto={abierto} onCerrar={onCerrar}>
      <SheetTitle className="font-heading text-[21px] font-extrabold tracking-[-0.02em]">¿Cuándo lo toma?</SheetTitle>
      <SheetDescription className="sr-only">Elegí los días y hasta cuándo</SheetDescription>

      <div className="eyebrow mb-2.5 mt-[18px] text-subtle">Días</div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            setAlgunos(false);
            onCambio({ ...valor, dias: [] });
          }}
          className={cn("rounded-full px-[17px] py-[11px] text-[13.5px]", claseOpcion(!mostrarDias))}
        >
          Todos los días
        </button>
        <button type="button" onClick={() => setAlgunos(true)} className={cn("rounded-full px-[17px] py-[11px] text-[13.5px]", claseOpcion(mostrarDias))}>
          Algunos días
        </button>
      </div>
      {mostrarDias && (
        <div className="mt-3 grid grid-cols-7 gap-1.5">
          {DIAS_CUANDO.map((d) => (
            <button
              key={d.dia}
              type="button"
              aria-label={d.corto}
              aria-pressed={valor.dias.includes(d.dia)}
              onClick={() => onCambio({ ...valor, dias: alternarDia(valor.dias, d.dia) })}
              className={cn("aspect-square rounded-full p-0 text-sm", claseOpcion(valor.dias.includes(d.dia)))}
            >
              {d.letra}
            </button>
          ))}
        </div>
      )}

      <div className="eyebrow mb-2.5 mt-[22px] text-subtle">Hasta cuándo</div>
      <div className="flex flex-wrap gap-2">
        {OPCIONES_HASTA.map((o) => (
          <button
            key={String(o.valor)}
            type="button"
            onClick={() => onCambio({ ...valor, hasta: o.valor })}
            className={cn("rounded-full px-[17px] py-[11px] text-[13.5px]", claseOpcion(valor.hasta === o.valor))}
          >
            {o.etiqueta}
          </button>
        ))}
      </div>
      {valor.hasta === "fecha" && (
        <input
          type="date"
          value={valor.fechaElegida}
          min={fechaHoyAR()}
          aria-label="Fecha de fin"
          onChange={(e) => onCambio({ ...valor, fechaElegida: e.target.value })}
          className="mt-3 w-full rounded-full border border-foreground/10 bg-card px-[18px] py-[13px] text-[14.5px] font-bold outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        />
      )}
      <button type="button" onClick={onCerrar} className={CLASE_BOTON_LISTO}>
        Listo
      </button>
    </Hoja>
  );
}

export function HojaCuantoQueda({
  abierto,
  forma,
  valor,
  onConfirmar,
  onCerrar,
}: {
  abierto: boolean;
  forma: FormaMedicamento;
  valor: number | null;
  onConfirmar: (stock: number) => void;
  onCerrar: () => void;
}) {
  return (
    <Hoja abierto={abierto} onCerrar={onCerrar}>
      <ContenidoCuanto forma={forma} valor={valor} onConfirmar={onConfirmar} />
    </Hoja>
  );
}

function ContenidoCuanto({ forma, valor, onConfirmar }: { forma: FormaMedicamento; valor: number | null; onConfirmar: (stock: number) => void }) {
  const [texto, setTexto] = useState(valor === null ? "" : String(valor).replace(".", ","));
  const numero = Number(texto.replace(",", "."));
  const valido = texto.trim() !== "" && Number.isFinite(numero) && numero >= 0 && numero <= STOCK_MAXIMO;
  const unidad = CONFIG_FORMA[forma].unidadStock;

  return (
    <>
      <SheetTitle className="font-heading text-[21px] font-extrabold tracking-[-0.02em]">Cuánto queda</SheetTitle>
      <SheetDescription className="sr-only">Escribí cuánto queda del medicamento</SheetDescription>
      <label className="mt-[18px] flex items-center gap-3 rounded-full border border-foreground/10 bg-card px-[18px] py-[13px]">
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          inputMode="decimal"
          aria-label={`Cuánto queda, en ${unidad}`}
          className="min-w-0 flex-1 bg-transparent text-[15.5px] font-bold outline-none"
        />
        <span className="text-sm font-bold text-subtle">{unidad}</span>
      </label>
      <button type="button" disabled={!valido} onClick={() => onConfirmar(numero)} className={cn(CLASE_BOTON_LISTO, !valido && "opacity-50")}>
        Listo
      </button>
    </>
  );
}
