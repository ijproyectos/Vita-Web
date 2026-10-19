"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { VitaIcon } from "@/lib/vita-icons";
import { TAMANIO_MAXIMO_BYTES, TIPO_PDF } from "@/lib/estudios/tipos";
import { subirEstudioAction, type EstadoAccion } from "../estudio-actions";

const ESTADO_INICIAL: EstadoAccion = { status: "idle" };

// Dos entradas distintas a propósito: `capture="environment"` abre la cámara
// trasera directo en mobile; el otro input deja elegir una foto de la galería
// o un PDF. Ninguno tiene `name`: el archivo elegido vive en estado y se
// agrega al FormData en la acción (así un solo input "gana", no dos).
export function FormularioAgregarEstudio() {
  const router = useRouter();
  const camaraRef = useRef<HTMLInputElement>(null);
  const archivoRef = useRef<HTMLInputElement>(null);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  function elegirArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    e.target.value = ""; // permite volver a elegir el mismo archivo
    if (f && f.size > TAMANIO_MAXIMO_BYTES) {
      setErrorLocal("El archivo pesa más de 10 MB. Probá con una foto más liviana o un PDF más chico.");
      return;
    }
    setErrorLocal(null);
    setArchivo(f);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return f && f.type !== TIPO_PDF ? URL.createObjectURL(f) : null;
    });
  }

  async function accion(prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
    if (archivo) formData.set("archivo", archivo);
    const resultado = await subirEstudioAction(prev, formData);
    if (resultado.status === "success") {
      toast.success("Estudio agregado");
      router.push("/app/mi-salud");
    }
    return resultado;
  }

  const [estado, formAction, pendiente] = useActionState(accion, ESTADO_INICIAL);

  return (
    <form action={formAction} className="flex flex-col gap-4.5">
      <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-[20px] bg-card text-subtle shadow-card">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- preview local de un blob: URL, no un asset de Next
          <img src={previewUrl} alt="" className="size-full object-cover" />
        ) : archivo ? (
          <>
            <VitaIcon name="doc" size={32} />
            <span className="max-w-full truncate px-6 font-heading text-sm font-bold">{archivo.name}</span>
            <span className="text-xs">PDF listo para analizar</span>
          </>
        ) : (
          <>
            <VitaIcon name="doc" size={32} />
            <span className="font-heading text-sm font-bold">Elegí cómo cargar el estudio</span>
            <span className="px-6 text-center text-xs">Foto del estudio completo o un PDF (máximo 10 MB)</span>
          </>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => camaraRef.current?.click()}
          disabled={pendiente}
          className="flex items-center justify-center gap-2 rounded-full bg-card py-3 font-heading text-[13.5px] font-bold text-primary shadow-card disabled:opacity-60"
        >
          <VitaIcon name="camera" size={16} /> Sacar foto
        </button>
        <button
          type="button"
          onClick={() => archivoRef.current?.click()}
          disabled={pendiente}
          className="flex items-center justify-center gap-2 rounded-full bg-card py-3 font-heading text-[13.5px] font-bold text-primary shadow-card disabled:opacity-60"
        >
          <VitaIcon name="upload" size={16} /> Subir foto o PDF
        </button>
      </div>
      <input
        ref={camaraRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={elegirArchivo}
        className="hidden"
      />
      <input
        ref={archivoRef}
        type="file"
        accept="image/*,application/pdf"
        onChange={elegirArchivo}
        className="hidden"
      />

      <p className="text-center text-xs text-muted-foreground">
        vita analiza la foto o el PDF y completa tipo, fecha y valores automáticamente. Si no puede leerlo, igual queda
        guardado y la completás vos.
      </p>

      {(errorLocal || estado.status === "error") && (
        <p className="rounded-[14px] bg-destructive/10 px-3.5 py-2.5 text-center text-sm text-destructive">
          {errorLocal ?? (estado.status === "error" ? estado.message : "")}
        </p>
      )}

      <button
        type="submit"
        disabled={!archivo || pendiente}
        className="rounded-full bg-primary py-3.5 font-heading text-[15px] font-extrabold text-primary-foreground shadow-[0_10px_24px_color-mix(in_srgb,var(--primary)_35%,transparent)] disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none"
      >
        {pendiente ? "Analizando…" : "Guardar estudio"}
      </button>
    </form>
  );
}
