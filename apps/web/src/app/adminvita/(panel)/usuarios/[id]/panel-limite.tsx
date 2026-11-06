"use client";

import { useState, useTransition } from "react";
import { LIMITE_INTERACCIONES_DIARIO_DEFAULT, LIMITE_INTERACCIONES_MAX, LIMITE_INTERACCIONES_MIN, MOTIVO_LIMITE_MAX, validarLimiteAdmin } from "@/lib/uso-ia/interacciones-logica";
import type { ResultadoLimiteInteracciones } from "@/lib/admin/limite-interacciones";
import { definirLimiteInteraccionesAction } from "./actions";

const CAMPO = "w-full rounded-2xl bg-panel-track px-4 py-2.5 text-sm font-normal text-ink focus-visible:outline-2 focus-visible:outline-teal";

// Cambiar cuántas consultas por día puede hacerle esta persona a vita. Dueños y administradores.
export function PanelLimite({ usuarioId, limiteActual, personalizado }: { usuarioId: string; limiteActual: number; personalizado: boolean }) {
  const [limite, setLimite] = useState(String(limiteActual));
  const [motivo, setMotivo] = useState("");
  const [resultado, setResultado] = useState<ResultadoLimiteInteracciones | null>(null);
  const [pendiente, iniciar] = useTransition();

  const validacion = validarLimiteAdmin({ limite, motivo });

  function guardar(volverAlGeneral: boolean) {
    iniciar(async () => {
      const r = await definirLimiteInteraccionesAction(usuarioId, limite, motivo, volverAlGeneral);
      setResultado(r);
      if (r.status === "success") {
        setMotivo("");
        if (volverAlGeneral) setLimite(String(LIMITE_INTERACCIONES_DIARIO_DEFAULT));
      }
    });
  }

  return (
    <form
      className="flex flex-col gap-3 rounded-[28px] bg-card p-5 shadow-panel sm:max-w-xl"
      onSubmit={(e) => {
        e.preventDefault();
        if (validacion.ok) guardar(false);
      }}
    >
      <label className="flex flex-col gap-1 text-xs font-bold text-slate-brand">
        Consultas por día ({LIMITE_INTERACCIONES_MIN} a {LIMITE_INTERACCIONES_MAX})
        <input type="number" inputMode="numeric" min={LIMITE_INTERACCIONES_MIN} max={LIMITE_INTERACCIONES_MAX} value={limite} onChange={(e) => setLimite(e.target.value)} className={CAMPO} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-bold text-slate-brand">
        Motivo, opcional ({motivo.trim().length}/{MOTIVO_LIMITE_MAX})
        <input type="text" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={MOTIVO_LIMITE_MAX + 40} className={CAMPO} />
      </label>
      {!validacion.ok && limite !== "" ? <p className="text-xs text-destructive">{validacion.mensaje}</p> : null}
      <span className="flex flex-wrap gap-2">
        <button type="submit" disabled={!validacion.ok || pendiente} className="rounded-full bg-teal px-5 py-2 text-sm font-bold text-on-ink disabled:opacity-50">
          {pendiente ? "Guardando…" : "Guardar límite"}
        </button>
        {personalizado ? (
          <button type="button" disabled={pendiente} onClick={() => guardar(true)} className="rounded-full border border-line px-5 py-2 text-sm font-bold disabled:opacity-50">
            Volver al límite general ({LIMITE_INTERACCIONES_DIARIO_DEFAULT})
          </button>
        ) : null}
      </span>
      {resultado ? (
        <p role={resultado.status === "error" ? "alert" : "status"} className={`text-sm font-semibold ${resultado.status === "error" ? "text-destructive" : "text-teal-deep"}`}>
          {resultado.mensaje}
        </p>
      ) : null}
    </form>
  );
}
