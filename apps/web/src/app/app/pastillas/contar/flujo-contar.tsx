"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { VitaIcon } from "@/lib/vita-icons";
import { cn } from "@/lib/utils";
import type { ConteoPastillas } from "@/lib/inventario/contar";
import {
  contarFotoAction,
  guardarInventarioAction,
  type EstadoConteo,
  type EstadoGuardado,
} from "../actions";

export type OpcionMedicamento = {
  id: string;
  etiqueta: string;
  stockActual: number | null;
  pastillasPorToma: number;
};

const CONTEO_INICIAL: EstadoConteo = { status: "idle" };
const GUARDADO_INICIAL: EstadoGuardado = { status: "idle" };

const ETIQUETA_CONFIANZA: Record<ConteoPastillas["confianza"], string> = {
  alta: "Seguridad alta",
  media: "Seguridad media — revisalo",
  baja: "Seguridad baja — revisalo bien",
};

// Flujo: 1) elegir medicamento, 2) foto del blister (opcional) y "contando…",
// 3) tarjeta EDITABLE con el número — nunca se guarda sola. También se puede
// cargar a mano sin foto, y si la IA falla se cae a eso con un aviso.
export function FlujoContar({ opciones, inicialId }: { opciones: OpcionMedicamento[]; inicialId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [medicamentoId, setMedicamentoId] = useState(inicialId);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const actual = opciones.find((o) => o.id === medicamentoId) ?? null;
  const [stock, setStock] = useState(actual?.stockActual != null ? String(actual.stockActual) : "");
  const [porToma, setPorToma] = useState(String(actual?.pastillasPorToma ?? 1));
  const [conteo, setConteo] = useState<ConteoPastillas | null>(null);

  function elegirMedicamento(id: string) {
    setMedicamentoId(id);
    const o = opciones.find((x) => x.id === id);
    setStock(o?.stockActual != null ? String(o.stockActual) : "");
    setPorToma(String(o?.pastillasPorToma ?? 1));
    setConteo(null);
  }

  function elegirArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setArchivo(f);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return f ? URL.createObjectURL(f) : null;
    });
  }

  async function accionContar(prev: EstadoConteo, formData: FormData): Promise<EstadoConteo> {
    const resultado = await contarFotoAction(prev, formData);
    // React resetea el <form> al terminar la acción (vacía el input de
    // archivo): se suelta también el archivo en estado para que "Contar"
    // no reenvíe un input vacío.
    setArchivo(null);
    if (resultado.status === "contado") {
      setConteo(resultado.conteo);
      setStock(String(resultado.conteo.pastillasRestantes));
    } else {
      setConteo(null);
    }
    return resultado;
  }

  async function accionGuardar(prev: EstadoGuardado, formData: FormData): Promise<EstadoGuardado> {
    const resultado = await guardarInventarioAction(prev, formData);
    if (resultado.status === "success") {
      toast.success("Stock guardado");
      router.push("/app/pastillas");
    }
    return resultado;
  }

  const [estadoConteo, contarAction, contando] = useActionState(accionContar, CONTEO_INICIAL);
  const [estadoGuardado, guardarAction, guardando] = useActionState(accionGuardar, GUARDADO_INICIAL);

  if (opciones.length === 0) {
    return (
      <div className="rounded-[20px] bg-secondary p-5 text-center">
        <p className="text-sm text-muted-foreground">Primero cargá un medicamento para poder contar sus pastillas.</p>
        <Link href="/app/agregar-medicamento" className="mt-2 inline-block text-sm font-semibold text-primary">
          Agregar un medicamento →
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4.5">
      <label className="flex flex-col gap-1.5">
        <span className="px-0.5 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Medicamento</span>
        <select
          value={medicamentoId}
          onChange={(e) => elegirMedicamento(e.target.value)}
          disabled={contando || guardando}
          className="rounded-full bg-card px-4 py-3 font-heading text-[14.5px] font-bold shadow-card outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {opciones.map((o) => (
            <option key={o.id} value={o.id}>
              {o.etiqueta}
            </option>
          ))}
        </select>
      </label>

      {/* Paso foto */}
      <form action={contarAction} className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={contando}
          className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2.5 overflow-hidden rounded-[20px] bg-secondary text-muted-foreground disabled:opacity-60"
        >
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- preview local de un blob: URL, no un asset de Next
            <img src={previewUrl} alt="" className="size-full object-cover" />
          ) : (
            <>
              <VitaIcon name="camera" size={32} />
              <span className="font-heading text-sm font-bold">Sacar o elegir una foto</span>
              <span className="px-6 text-center text-xs">Del blister, con buena luz y todas las pastillas a la vista</span>
            </>
          )}
        </button>
        <input
          ref={inputRef}
          type="file"
          name="archivo"
          accept="image/*"
          capture="environment"
          onChange={elegirArchivo}
          className="hidden"
        />

        {previewUrl && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={contando}
            className="text-center text-sm font-semibold text-primary disabled:opacity-60"
          >
            Elegir otra foto
          </button>
        )}

        <button
          type="submit"
          disabled={!archivo || contando}
          className="rounded-full bg-gradient-to-br from-brand-from to-brand-to py-3.5 font-heading text-[15px] font-extrabold text-primary-foreground shadow-[0_10px_24px_color-mix(in_srgb,var(--primary)_35%,transparent)] disabled:from-muted disabled:to-muted disabled:text-muted-foreground disabled:shadow-none"
        >
          {contando ? "Contando…" : "Contar con vita"}
        </button>

        {estadoConteo.status === "manual" && (
          <p className="rounded-[14px] bg-chip-amber-bg px-3.5 py-2.5 text-center text-sm text-chip-amber-ink">
            {estadoConteo.message}
          </p>
        )}
      </form>

      {/* Resultado editable / carga manual — siempre visible, nunca auto-guarda */}
      <form action={guardarAction} className="flex flex-col gap-3.5 rounded-[20px] bg-card p-4.5 shadow-card">
        <input type="hidden" name="medicamentoId" value={medicamentoId} />

        <div>
          <div className="font-heading text-[15px] font-bold">{conteo ? "Esto vi en la foto" : "Cargar a mano"}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {conteo
              ? "Revisalo y corregilo si hace falta. No se guarda hasta que toques Guardar."
              : "Si no querés usar la foto, escribí cuántas pastillas te quedan."}
          </div>
        </div>

        {conteo && (
          <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
            <span
              className={cn(
                "rounded-full px-2.5 py-1 font-semibold",
                conteo.confianza === "alta" ? "bg-chip-teal-bg text-chip-teal-ink" : "bg-chip-amber-bg text-chip-amber-ink"
              )}
            >
              {ETIQUETA_CONFIANZA[conteo.confianza]}
            </span>
            <span className="rounded-full bg-secondary px-2.5 py-1 font-semibold text-muted-foreground">
              {conteo.blistersDetectados} {conteo.blistersDetectados === 1 ? "blister" : "blisters"}
            </span>
            {conteo.alveolosTotales !== null && (
              <span className="rounded-full bg-secondary px-2.5 py-1 font-semibold text-muted-foreground">
                {conteo.alveolosTotales} alvéolos en total
              </span>
            )}
          </div>
        )}
        {conteo?.nota && <p className="text-xs text-muted-foreground">{conteo.nota}</p>}

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-muted-foreground">Pastillas que quedan</span>
            <input
              type="number"
              name="stock"
              inputMode="numeric"
              min={0}
              step={1}
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              className="rounded-full bg-secondary px-4 py-3 text-center font-heading text-[18px] font-extrabold outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-muted-foreground">Pastillas por toma</span>
            <input
              type="number"
              name="pastillasPorToma"
              inputMode="numeric"
              min={1}
              step={1}
              value={porToma}
              onChange={(e) => setPorToma(e.target.value)}
              className="rounded-full bg-secondary px-4 py-3 text-center font-heading text-[18px] font-extrabold outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
        </div>

        {estadoGuardado.status === "error" && (
          <p className="rounded-[14px] bg-destructive/10 px-3.5 py-2.5 text-center text-sm text-destructive">
            {estadoGuardado.message}
          </p>
        )}

        <button
          type="submit"
          disabled={guardando || contando || stock === ""}
          className="rounded-full bg-gradient-to-br from-brand-from to-brand-to py-3.5 font-heading text-[15px] font-extrabold text-primary-foreground shadow-[0_10px_24px_color-mix(in_srgb,var(--primary)_35%,transparent)] disabled:from-muted disabled:to-muted disabled:text-muted-foreground disabled:shadow-none"
        >
          {guardando ? "Guardando…" : "Guardar"}
        </button>
      </form>
    </div>
  );
}
