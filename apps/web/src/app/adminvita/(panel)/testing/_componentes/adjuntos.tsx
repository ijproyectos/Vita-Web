"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { MAX_BYTES_ADJUNTO, TIPOS_ADJUNTO, validarAdjunto } from "@/lib/admin/testing/logica";
import { borrarAdjuntoAction, prepararSubidaAction, registrarAdjuntoAction } from "../actions";
import { BotonAccion } from "./formularios";

const BUCKET = "track-adjuntos";

export type AdjuntoVista = { id: number; nombre: string; mime: string; tamano_bytes: number; subido_por: string; url: string | null };

function kb(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Capturas y videos de un bug, reporte o prueba. La subida va directo al bucket privado con una URL firmada que emite el
 * servidor (después de requireAdmin); la lectura usa URLs firmadas de 1 hora.
 */
export function Adjuntos({ tipo, id, adjuntos, soloLectura = false }: { tipo: "bug" | "reporte" | "prueba"; id: number; adjuntos: AdjuntoVista[]; soloLectura?: boolean }) {
  const entrada = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function subir(archivos: FileList | null) {
    const lista = archivos ? [...archivos] : [];
    if (lista.length === 0) return;
    setError(null);
    iniciar(async () => {
      for (const archivo of lista) {
        const v = validarAdjunto(archivo.type, archivo.size);
        if (!v.ok) {
          setError(`${archivo.name}: ${v.mensaje}`);
          break;
        }
        const p = await prepararSubidaAction(tipo, id, archivo.name, archivo.type, archivo.size);
        if (p.status === "error") {
          setError(p.mensaje);
          break;
        }
        const { error: errorSubida } = await createClient().storage.from(BUCKET).uploadToSignedUrl(p.ruta, p.token, archivo, { contentType: archivo.type });
        if (errorSubida) {
          setError(`No pudimos subir ${archivo.name}.`);
          break;
        }
        const r = await registrarAdjuntoAction(tipo, id, p.ruta, archivo.name, archivo.type, archivo.size);
        if (r.status === "error") {
          setError(r.mensaje);
          break;
        }
      }
      if (entrada.current) entrada.current.value = "";
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {adjuntos.length === 0 ? <p className="text-sm text-subtle">Todavía no hay capturas ni videos.</p> : null}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {adjuntos.map((a) => (
          <li key={a.id} className="overflow-hidden rounded-2xl bg-panel-track">
            {a.url && a.mime.startsWith("image/") ? (
              // eslint-disable-next-line @next/next/no-img-element -- URL firmada temporal de un bucket privado
              <img src={a.url} alt={a.nombre} loading="lazy" className="h-40 w-full object-cover" />
            ) : a.url && a.mime.startsWith("video/") ? (
              <video src={a.url} controls preload="metadata" className="h-40 w-full bg-ink object-contain" />
            ) : (
              <p className="p-4 text-xs text-subtle">No se pudo mostrar el archivo.</p>
            )}
            <div className="flex items-center justify-between gap-2 p-3 text-xs">
              <span className="min-w-0">
                <span className="block truncate font-semibold text-ink">{a.nombre}</span>
                <span className="text-subtle">
                  {kb(a.tamano_bytes)} · {a.subido_por}
                </span>
              </span>
              {soloLectura ? null : <BotonAccion accion={borrarAdjuntoAction.bind(null, a.id)} texto="Borrar" confirmar="¿Borrar?" tono="peligro" />}
            </div>
          </li>
        ))}
      </ul>
      {soloLectura ? null : (
        <div>
          <input
            ref={entrada}
            type="file"
            multiple
            accept={TIPOS_ADJUNTO.join(",")}
            disabled={pendiente}
            onChange={(e) => subir(e.target.files)}
            aria-label="Subir capturas o videos"
            className="block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-teal file:px-4 file:py-2 file:text-xs file:font-bold file:text-on-ink"
          />
          <p className="mt-1 text-xs text-subtle">Imágenes o videos de hasta {MAX_BYTES_ADJUNTO / 1024 / 1024} MB. {pendiente ? "Subiendo…" : ""}</p>
          {error ? (
            <p role="alert" className="mt-1 text-xs font-semibold text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
