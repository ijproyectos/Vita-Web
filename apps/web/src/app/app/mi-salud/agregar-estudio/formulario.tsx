"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { VitaIcon } from "@/lib/vita-icons";
import { subirEstudioAction, type EstadoAccion } from "../estudio-actions";

const ESTADO_INICIAL: EstadoAccion = { status: "idle" };

// `capture="environment"` dispara la cámara trasera en mobile (Safari/
// Chrome); en desktop el mismo input cae a un selector de archivo normal
// — un solo input cubre "sacar una foto" y "elegir de la galería" sin
// necesitar dos botones separados.
export function FormularioAgregarEstudio() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  function elegirArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setArchivo(f);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return f ? URL.createObjectURL(f) : null;
    });
  }

  async function accion(prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
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
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={pendiente}
        className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2.5 overflow-hidden rounded-[20px] bg-secondary text-muted-foreground disabled:opacity-60"
      >
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- preview local de un blob: URL, no un asset de Next
          <img src={previewUrl} alt="" className="size-full object-cover" />
        ) : (
          <>
            <VitaIcon name="camera" size={32} />
            <span className="font-heading text-sm font-bold">Sacar o elegir una foto</span>
            <span className="text-xs">Del estudio médico completo</span>
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
          disabled={pendiente}
          className="text-center text-sm font-semibold text-primary disabled:opacity-60"
        >
          Elegir otra foto
        </button>
      )}

      <p className="text-center text-xs text-muted-foreground">
        vita analiza la foto y completa tipo, fecha y valores automáticamente. Si no puede leerla, igual queda
        guardada y la completás vos.
      </p>

      {estado.status === "error" && (
        <p className="rounded-[14px] bg-destructive/10 px-3.5 py-2.5 text-center text-sm text-destructive">
          {estado.message}
        </p>
      )}

      <button
        type="submit"
        disabled={!archivo || pendiente}
        className="rounded-full bg-gradient-to-br from-[#22d3ee] to-[#0e7490] py-3.5 font-heading text-[15px] font-extrabold text-white shadow-[0_10px_24px_rgba(8,145,178,0.35)] disabled:from-muted disabled:to-muted disabled:text-muted-foreground disabled:shadow-none"
      >
        {pendiente ? "Analizando…" : "Guardar estudio"}
      </button>
    </form>
  );
}
