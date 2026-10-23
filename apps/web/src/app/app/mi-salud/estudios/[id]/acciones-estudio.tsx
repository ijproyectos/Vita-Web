"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useVolver } from "@/lib/navegacion/rastreador";
import { toast } from "sonner";
import { VitaIcon } from "@/lib/vita-icons";
import { eliminarEstudioAction } from "../../estudio-actions";

type ArchivoEstudio = { nombreArchivo: string; esPdf: boolean; url: string | null };

export function BotonVolver() {
  const volver = useVolver("/app/mi-salud");
  return (
    <button
      type="button"
      onClick={volver}
      aria-label="Volver"
      className="flex size-10 shrink-0 items-center justify-center rounded-full bg-card shadow-card transition-transform active:scale-[0.94] motion-reduce:transition-none"
    >
      <VitaIcon name="chevron-left" size={18} strokeWidth={2.2} />
    </button>
  );
}

/** La tarjeta del archivo (markup estático que llega como children) abre el visor. */
export function BotonVerArchivo({ archivo, children }: { archivo: ArchivoEstudio; children: ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        disabled={!archivo.url}
        className="flex items-center gap-3.5 rounded-[20px] bg-card p-3 text-left shadow-card transition-transform active:scale-[0.99] disabled:opacity-60 motion-reduce:transition-none"
      >
        {children}
      </button>
      {abierto && archivo.url && typeof document !== "undefined" &&
        createPortal(<VisorArchivo nombreArchivo={archivo.nombreArchivo} url={archivo.url} esPdf={archivo.esPdf} onCerrar={() => setAbierto(false)} />, document.body)}
    </>
  );
}

export function BotonCompartir({ titulo, archivo }: { titulo: string; archivo: ArchivoEstudio }) {
  const { url, nombreArchivo, esPdf } = archivo;
  async function compartir() {
    try {
      if (url && typeof navigator.canShare === "function") {
        try {
          const blob = await (await fetch(url)).blob();
          const file = new File([blob], nombreArchivo, { type: blob.type || (esPdf ? "application/pdf" : "image/jpeg") });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: titulo });
            return;
          }
        } catch (e) {
          if (e instanceof DOMException && e.name === "AbortError") return;
          // sin CORS o sin soporte de archivos: cae al enlace
        }
      }
      if (url && typeof navigator.share === "function") {
        await navigator.share({ title: titulo, text: `${titulo} · vita`, url });
        return;
      }
      if (url && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        toast.success("Enlace copiado. Vale 1 hora.");
        return;
      }
      toast.error("No pude compartir el archivo desde este dispositivo.");
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      toast.error("No pude compartir el archivo.");
    }
  }
  return (
    <button
      type="button"
      onClick={compartir}
      disabled={!url}
      className="rounded-full bg-primary p-[15px] font-heading text-[14.5px] font-extrabold text-primary-foreground shadow-cta transition-transform active:scale-[0.98] disabled:opacity-60 motion-reduce:transition-none"
    >
      Compartir
    </button>
  );
}

export function EliminarEstudio({ id }: { id: string }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [eliminando, startTransition] = useTransition();

  function eliminar() {
    startTransition(async () => {
      try {
        const r = await eliminarEstudioAction(id);
        if (r.status === "error") {
          toast.error(r.message);
          return;
        }
        toast.success("Estudio eliminado");
        router.replace("/app/mi-salud");
      } catch {
        toast.error("No se pudo eliminar el estudio.");
      }
    });
  }

  if (!confirmando) {
    return (
      <button type="button" onClick={() => setConfirmando(true)} className="self-center px-3.5 py-2 text-[13px] font-bold text-destructive">
        Eliminar estudio
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-3 rounded-[20px] bg-card p-4 shadow-card">
      <div className="text-[14.5px] font-extrabold">¿Eliminar este estudio?</div>
      <div className="-mt-1.5 text-[12.5px] font-medium text-slate-brand">Se borra el archivo y no se puede recuperar.</div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setConfirmando(false)}
          disabled={eliminando}
          className="flex-1 rounded-full border border-foreground/10 bg-transparent p-3 text-[13.5px] font-bold text-slate-brand"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={eliminar}
          disabled={eliminando}
          className="flex-1 rounded-full bg-destructive p-3 text-[13.5px] font-extrabold text-destructive-foreground disabled:opacity-60"
        >
          {eliminando ? "Eliminando…" : "Eliminar"}
        </button>
      </div>
    </div>
  );
}

// "Ver archivo" (D:2650): overlay oscuro con el original. Imagen directa; PDF en
// <object> con enlace "Abrir" de respaldo (Safari iOS solo muestra la 1.ª página).
function VisorArchivo({ nombreArchivo, url, esPdf, onCerrar }: { nombreArchivo: string; url: string; esPdf: boolean; onCerrar: () => void }) {
  // Escape cierra el visor.
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [onCerrar]);
  return (
    <div role="dialog" aria-modal="true" aria-label={nombreArchivo} className="fixed inset-0 z-[60] flex flex-col bg-ink pt-[max(env(safe-area-inset-top),20px)]">
      <div className="flex items-center gap-2.5 px-3.5 py-2">
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-on-ink/10 text-on-ink"
        >
          <VitaIcon name="close" size={16} strokeWidth={2.4} />
        </button>
        <div className="min-w-0 flex-1 truncate text-sm font-bold text-on-ink">{nombreArchivo}</div>
        <a
          href={url}
          download={nombreArchivo}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Descargar"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-on-ink/10 text-on-ink"
        >
          <VitaIcon name="download" size={17} strokeWidth={2.2} />
        </a>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto px-4 py-3">
        {esPdf ? (
          <object data={url} type="application/pdf" className="h-full w-full rounded-[6px] bg-paper">
            <div className="flex h-full flex-col items-center justify-center gap-3 rounded-[6px] bg-paper p-6 text-center">
              <p className="text-sm font-medium text-slate-brand">Este dispositivo no puede mostrar el PDF acá.</p>
              <a href={url} target="_blank" rel="noopener noreferrer" className="rounded-full bg-primary px-5 py-2.5 text-sm font-extrabold text-primary-foreground">
                Abrir
              </a>
            </div>
          </object>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- URL firmada temporal de Storage privado, no un asset de Next
          <img src={url} alt="Foto del estudio" className="max-h-full max-w-full rounded-[6px] bg-paper object-contain" />
        )}
      </div>
      <div className="flex items-center justify-center gap-3 px-4 pb-[max(env(safe-area-inset-bottom),20px)] text-xs font-semibold text-on-ink/60">
        {esPdf ? (
          <a href={url} target="_blank" rel="noopener noreferrer" className="rounded-full bg-on-ink/10 px-4 py-2 font-bold text-on-ink">
            Abrir en otra pestaña
          </a>
        ) : (
          "Pellizcá para acercar"
        )}
      </div>
    </div>
  );
}
