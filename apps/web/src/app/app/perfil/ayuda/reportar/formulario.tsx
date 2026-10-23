"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { VitaIcon } from "@/lib/vita-icons";
import { Interruptor } from "@/components/vita/interruptor";
import { Tile } from "../../filas";
import { enviarReporteAction } from "./actions";
import { CATEGORIAS_REPORTE, MAX_CAPTURA_BYTES, MAX_TEXTO_REPORTE, type EstadoReporte } from "./tipos";

const INICIAL: EstadoReporte = { status: "idle" };

export function FormularioReporte() {
  const [estado, accion, pendiente] = useActionState(enviarReporteAction, INICIAL);
  const [categoria, setCategoria] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [dispositivo, setDispositivo] = useState(true);
  const [captura, setCaptura] = useState<File | null>(null);
  const [errorCaptura, setErrorCaptura] = useState<string | null>(null);
  const archivo = useRef<HTMLInputElement>(null);

  if (estado.status === "success") {
    return (
      <div className="flex flex-col items-center gap-2.5 rounded-[22px] bg-card px-5 py-7 text-center shadow-card">
        <div className="flex size-[60px] items-center justify-center rounded-full bg-persona-1-tint text-persona-1-deep">
          <VitaIcon name="check" size={28} strokeWidth={2.6} />
        </div>
        <div className="mt-1 font-heading text-xl font-extrabold tracking-[-0.02em]">¡Gracias! Lo recibimos</div>
        <p className="text-pretty text-[13.5px] font-medium leading-[1.5] text-slate-brand">
          Lo revisamos y te respondemos en menos de 24 horas{estado.email ? ` a ${estado.email}` : ""}.
        </p>
        <Link href="/app/perfil/ayuda" className="mt-2.5 flex h-12 items-center rounded-full bg-primary px-7 text-[15px] font-extrabold text-primary-foreground">
          Listo
        </Link>
      </div>
    );
  }

  const listo = categoria !== null && texto.trim().length >= 5 && !pendiente;

  function elegirArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setErrorCaptura(null);
    if (f && f.size > MAX_CAPTURA_BYTES) {
      setErrorCaptura("La captura pesa más de 5 MB. Elegí una más chica.");
      e.target.value = "";
      setCaptura(null);
      return;
    }
    setCaptura(f);
  }

  return (
    <form
      action={(fd) => {
        // El user-agent solo existe en el navegador: se agrega al enviar.
        fd.set("agente", dispositivo ? navigator.userAgent : "");
        return accion(fd);
      }}
      className="flex flex-col gap-5"
    >
      <input type="hidden" name="categoria" value={categoria ?? ""} />
      <input type="hidden" name="dispositivo" value={dispositivo ? "1" : "0"} />

      <div className="flex flex-col gap-2.5">
        <div className="eyebrow px-0.5 text-subtle">¿Sobre qué es?</div>
        <div className="flex flex-wrap gap-[7px]" role="radiogroup" aria-label="Tema del problema">
          {CATEGORIAS_REPORTE.map((c) => {
            const activa = categoria === c;
            return (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={activa}
                onClick={() => setCategoria(c)}
                className={cn(
                  "rounded-full px-[15px] py-2.5 text-[13.5px] font-bold transition-all motion-reduce:transition-none",
                  activa ? "bg-primary text-primary-foreground shadow-cta" : "bg-card text-foreground shadow-item"
                )}
              >
                {c}
              </button>
            );
          })}
        </div>
      </div>

      <label className="flex flex-col gap-2.5">
        <span className="eyebrow px-0.5 text-subtle">¿Qué pasó?</span>
        <textarea
          name="texto"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          maxLength={MAX_TEXTO_REPORTE}
          placeholder="Ej: no me llegó el aviso de las 8"
          className="min-h-[130px] resize-none rounded-[20px] bg-card px-[18px] py-4 text-[14.5px] font-medium leading-[1.5] shadow-card outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        />
      </label>

      <div className="overflow-hidden rounded-[20px] bg-card shadow-card">
        <input ref={archivo} type="file" name="captura" accept="image/*" onChange={elegirArchivo} className="sr-only" tabIndex={-1} />
        <div className="flex items-center gap-3 border-b border-foreground/[0.06]">
          <button type="button" onClick={() => archivo.current?.click()} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-[15px] text-left">
            <Tile icon="camera" />
            <span className="min-w-0 flex-1">
              <span className="block font-heading text-[14.5px] font-extrabold tracking-[-0.02em]">
                {captura ? "Captura adjunta" : "Adjuntar una captura"}
              </span>
              <span className="mt-0.5 block truncate text-[11.5px] font-medium text-subtle">
                {captura ? captura.name : "Opcional · nos ayuda a entenderlo más rápido (hasta 5 MB)"}
              </span>
            </span>
          </button>
          {captura && (
            <button
              type="button"
              aria-label="Quitar captura"
              onClick={() => {
                setCaptura(null);
                if (archivo.current) archivo.current.value = "";
              }}
              className="mr-4 flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-slate-brand"
            >
              <VitaIcon name="close" size={14} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-3 px-4 py-[15px]">
          <div className="min-w-0 flex-1">
            <div className="font-heading text-[14.5px] font-extrabold tracking-[-0.02em]">Incluir datos del teléfono</div>
            <div className="mt-0.5 text-[11.5px] font-medium leading-[1.4] text-subtle">Modelo del navegador y versión de la app. Nada de tu salud.</div>
          </div>
          <Interruptor activo={dispositivo} onChange={setDispositivo} label="Incluir datos del teléfono" />
        </div>
      </div>

      {(errorCaptura || estado.status === "error") && (
        <p role="alert" className="rounded-[14px] bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
          {errorCaptura ?? (estado.status === "error" ? estado.mensaje : "")}
        </p>
      )}

      <button
        type="submit"
        disabled={!listo}
        className={cn(
          "h-[54px] rounded-full font-heading text-base font-extrabold text-primary-foreground transition-colors",
          listo ? "bg-primary shadow-cta" : "bg-faint"
        )}
      >
        {pendiente ? "Enviando…" : "Enviar"}
      </button>
    </form>
  );
}
