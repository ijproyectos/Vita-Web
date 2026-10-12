"use client";

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
  nombre: string;
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

// Flujo: 1) foto del FRENTE del blister (cuenta las pastillas) y, opcional pero
// recomendada, del DORSO (nombre y dosis impresos), 2) "contando…", 3) tarjeta
// EDITABLE — nunca se guarda sola. El medicamento puede ser uno existente o
// "uno nuevo": si el nombre no se leyó, hay que escribirlo para poder guardar.
// También se puede cargar a mano sin fotos.
export function FlujoContar({ opciones, inicialId }: { opciones: OpcionMedicamento[]; inicialId: string }) {
  const router = useRouter();

  const [medicamentoId, setMedicamentoId] = useState(inicialId); // "" = medicamento nuevo
  const [frente, setFrente] = useState<File | null>(null);
  const [dorso, setDorso] = useState<File | null>(null);
  const [previewFrente, setPreviewFrente] = useState<string | null>(null);
  const [previewDorso, setPreviewDorso] = useState<string | null>(null);
  const actual = opciones.find((o) => o.id === medicamentoId) ?? null;
  const [stock, setStock] = useState(actual?.stockActual != null ? String(actual.stockActual) : "");
  const [porToma, setPorToma] = useState(String(actual?.pastillasPorToma ?? 1));
  const [nombre, setNombre] = useState("");
  const [dosis, setDosis] = useState("");
  const [conteo, setConteo] = useState<ConteoPastillas | null>(null);

  const esNuevo = medicamentoId === "";

  function elegirMedicamento(id: string) {
    setMedicamentoId(id);
    if (conteo) return; // lo contado manda sobre el stock viejo
    const o = opciones.find((x) => x.id === id);
    setStock(o?.stockActual != null ? String(o.stockActual) : "");
    setPorToma(String(o?.pastillasPorToma ?? 1));
  }

  function elegirFoto(lado: "frente" | "dorso", e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    e.target.value = "";
    const setArchivo = lado === "frente" ? setFrente : setDorso;
    const setPreview = lado === "frente" ? setPreviewFrente : setPreviewDorso;
    setArchivo(f);
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return f ? URL.createObjectURL(f) : null;
    });
  }

  async function accionContar(prev: EstadoConteo, formData: FormData): Promise<EstadoConteo> {
    if (frente) formData.set("frente", frente);
    if (dorso) formData.set("dorso", dorso);
    const resultado = await contarFotoAction(prev, formData);
    if (resultado.status === "contado") {
      setConteo(resultado.conteo);
      setStock(String(resultado.conteo.pastillasRestantes));
      // Solo se pisan nombre/dosis si la IA leyó algo: no borrar lo que el
      // usuario ya escribió a mano.
      if (resultado.conteo.nombreDetectado) setNombre(resultado.conteo.nombreDetectado);
      if (resultado.conteo.dosisDetectada) setDosis(resultado.conteo.dosisDetectada);
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
    } else if (resultado.status === "nuevo") {
      toast.message("Medicamento nuevo: completá cuándo lo tomás para terminar de agregarlo");
      router.push(resultado.url);
    }
    return resultado;
  }

  const [estadoConteo, contarAction, contando] = useActionState(accionContar, CONTEO_INICIAL);
  const [estadoGuardado, guardarAction, guardando] = useActionState(accionGuardar, GUARDADO_INICIAL);

  const ocupado = contando || guardando;
  const nombreFaltante = esNuevo && nombre.trim() === "";
  // El nombre detectado no se parece al medicamento elegido: aviso para no pisar stock ajeno.
  const detectado = conteo?.nombreDetectado?.trim().toLowerCase() ?? "";
  const elegido = actual?.nombre.trim().toLowerCase() ?? "";
  const nombreNoCoincide =
    !esNuevo && detectado !== "" && elegido !== "" && !detectado.includes(elegido) && !elegido.includes(detectado);

  return (
    <div className="flex flex-col gap-4.5">
      <label className="flex flex-col gap-1.5">
        <span className="px-0.5 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Medicamento</span>
        <select
          value={medicamentoId}
          onChange={(e) => elegirMedicamento(e.target.value)}
          disabled={ocupado}
          className="rounded-full bg-card px-4 py-3 font-heading text-[14.5px] font-bold shadow-card outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">Es un medicamento nuevo</option>
          {opciones.map((o) => (
            <option key={o.id} value={o.id}>
              {o.etiqueta}
            </option>
          ))}
        </select>
      </label>

      {/* Pasos foto: frente (cuenta) + dorso (nombre y dosis) */}
      <form action={contarAction} className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <SlotFoto
            titulo="1. Frente"
            ayuda="El lado donde se ven las pastillas"
            preview={previewFrente}
            archivo={frente}
            disabled={contando}
            onChange={(e) => elegirFoto("frente", e)}
          />
          <SlotFoto
            titulo="2. Dorso"
            ayuda="El lado con el nombre y la dosis impresos (recomendado)"
            preview={previewDorso}
            archivo={dorso}
            disabled={contando}
            onChange={(e) => elegirFoto("dorso", e)}
          />
        </div>

        <button
          type="submit"
          disabled={!frente || contando}
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
          <div className="font-heading text-[15px] font-bold">{conteo ? "Esto vi en las fotos" : "Cargar a mano"}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {conteo
              ? "Revisalo y corregilo si hace falta. No se guarda hasta que toques Guardar."
              : "Si no querés usar las fotos, escribí cuántas pastillas te quedan."}
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

        {esNuevo && (
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-semibold text-muted-foreground">Nombre del medicamento</span>
              <input
                type="text"
                name="nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Metformina, Losartán…"
                className="w-full rounded-full bg-secondary px-4 py-3 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            <label className="flex w-28 flex-col gap-1.5">
              <span className="text-[12px] font-semibold text-muted-foreground">Dosis</span>
              <input
                type="text"
                name="dosis"
                value={dosis}
                onChange={(e) => setDosis(e.target.value)}
                placeholder="500 mg"
                className="w-full rounded-full bg-secondary px-4 py-3 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
          </div>
        )}
        {esNuevo && nombreFaltante && (
          <p className="rounded-[14px] bg-chip-amber-bg px-3.5 py-2.5 text-[13px] font-semibold text-chip-amber-ink">
            {conteo
              ? "No pude leer el nombre en las fotos. Escribilo para poder guardar."
              : "Escribí el nombre del medicamento, o sacá la foto del dorso del blister y vita lo lee."}
          </p>
        )}
        {nombreNoCoincide && (
          <p className="rounded-[14px] bg-chip-amber-bg px-3.5 py-2.5 text-[13px] font-semibold text-chip-amber-ink">
            En el blister dice &ldquo;{conteo?.nombreDetectado}&rdquo;, que no coincide con {actual?.nombre}. Revisá que
            hayas elegido el medicamento correcto.
          </p>
        )}

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
          disabled={ocupado || stock === "" || nombreFaltante}
          className="rounded-full bg-gradient-to-br from-brand-from to-brand-to py-3.5 font-heading text-[15px] font-extrabold text-primary-foreground shadow-[0_10px_24px_color-mix(in_srgb,var(--primary)_35%,transparent)] disabled:from-muted disabled:to-muted disabled:text-muted-foreground disabled:shadow-none"
        >
          {guardando ? "Guardando…" : esNuevo ? "Guardar y agregar medicamento" : "Guardar"}
        </button>
      </form>

      {opciones.length === 0 && (
        <p className="text-center text-xs text-muted-foreground">
          Todavía no tenés medicamentos cargados: sacale foto al blister y vita te ayuda a agregarlo.
        </p>
      )}
    </div>
  );
}

// Un slot de foto: abre la cámara trasera en mobile (en desktop cae al
// selector de archivos). El input no tiene `name`: el archivo vive en estado
// del padre y se agrega al FormData en la acción.
function SlotFoto({
  titulo,
  ayuda,
  preview,
  archivo,
  disabled,
  onChange,
}: {
  titulo: string;
  ayuda: string;
  preview: string | null;
  archivo: File | null;
  disabled: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => ref.current?.click()}
        disabled={disabled}
        className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-[20px] bg-secondary text-muted-foreground disabled:opacity-60"
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- preview local de un blob: URL, no un asset de Next
          <img src={preview} alt="" className="size-full object-cover" />
        ) : (
          <>
            <VitaIcon name="camera" size={28} />
            <span className="font-heading text-[13px] font-bold">{titulo}</span>
            <span className="px-3 text-center text-[11px] leading-tight">{ayuda}</span>
          </>
        )}
      </button>
      <input ref={ref} type="file" accept="image/*" capture="environment" onChange={onChange} className="hidden" />
      {archivo && (
        <button
          type="button"
          onClick={() => ref.current?.click()}
          disabled={disabled}
          className="text-center text-xs font-semibold text-primary disabled:opacity-60"
        >
          Cambiar foto
        </button>
      )}
    </div>
  );
}
