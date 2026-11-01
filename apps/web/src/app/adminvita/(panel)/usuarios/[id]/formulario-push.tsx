"use client";

import { useState, useTransition } from "react";
import { CUERPO_PUSH_MAX, TITULO_PUSH_MAX, validarMensajePush } from "@/lib/admin/push-form";
import type { ResultadoPushAdmin } from "@/lib/admin/push";
import { enviarPushAction } from "./actions";

const CAMPO = "w-full rounded-[var(--radius-item)] border border-line bg-paper px-3 py-2 text-sm";

export function FormularioPush({ usuarioId, dispositivos }: { usuarioId: string; dispositivos: number }) {
  const [titulo, setTitulo] = useState("");
  const [cuerpo, setCuerpo] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoPushAdmin | null>(null);
  const [pendiente, iniciar] = useTransition();

  const validacion = validarMensajePush({ titulo, cuerpo });

  function enviar() {
    iniciar(async () => {
      const r = await enviarPushAction(usuarioId, titulo, cuerpo);
      setResultado(r);
      setConfirmando(false);
      if (r.status === "success") {
        setTitulo("");
        setCuerpo("");
      }
    });
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <form
        className="flex flex-col gap-3 rounded-[var(--radius-item)] border border-line bg-paper p-4 shadow-item"
        onSubmit={(e) => {
          e.preventDefault();
          if (validacion.ok) setConfirmando(true);
        }}
      >
        <label className="flex flex-col gap-1 text-xs font-bold text-slate-brand">
          Título ({titulo.trim().length}/{TITULO_PUSH_MAX})
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={TITULO_PUSH_MAX + 20} className={CAMPO} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-bold text-slate-brand">
          Mensaje ({cuerpo.trim().length}/{CUERPO_PUSH_MAX})
          <textarea value={cuerpo} onChange={(e) => setCuerpo(e.target.value)} rows={3} maxLength={CUERPO_PUSH_MAX + 40} className={CAMPO} />
        </label>
        <p className="text-xs text-subtle">
          {dispositivos === 0
            ? "Este usuario no tiene dispositivos con push: el mensaje solo quedaría en su centro de avisos."
            : `Se envía a ${dispositivos} ${dispositivos === 1 ? "dispositivo" : "dispositivos"} y queda en su centro de avisos.`}{" "}
          Máximo 10 por hora.
        </p>
        {!validacion.ok && (titulo !== "" || cuerpo !== "") ? <p className="text-xs text-destructive">{validacion.error}</p> : null}

        {confirmando ? (
          <div role="alertdialog" aria-label="Confirmar envío" className="flex flex-col gap-2 rounded-[var(--radius-item)] bg-mint p-3">
            <p className="text-sm font-bold text-teal-deep">¿Enviar esta notificación al usuario?</p>
            <span className="flex gap-2">
              <button type="button" onClick={enviar} disabled={pendiente} className="rounded-full bg-teal px-4 py-1.5 text-xs font-bold text-on-ink disabled:opacity-60">
                {pendiente ? "Enviando…" : "Sí, enviar"}
              </button>
              <button type="button" onClick={() => setConfirmando(false)} disabled={pendiente} className="rounded-full border border-line px-4 py-1.5 text-xs font-bold">
                Cancelar
              </button>
            </span>
          </div>
        ) : (
          <button type="submit" disabled={!validacion.ok || pendiente} className="self-start rounded-full bg-teal px-5 py-2 text-sm font-bold text-on-ink disabled:opacity-50">
            Enviar notificación
          </button>
        )}
        {resultado ? (
          <p role={resultado.status === "error" ? "alert" : "status"} className={`text-sm font-semibold ${resultado.status === "error" ? "text-destructive" : "text-teal-deep"}`}>
            {resultado.mensaje}
          </p>
        ) : null}
      </form>

      <div aria-label="Vista previa" className="rounded-[var(--radius-item)] border border-dashed border-line bg-canvas p-4">
        <p className="eyebrow">Vista previa</p>
        <div className="mt-2 rounded-[var(--radius-item)] bg-card p-3 shadow-card">
          <p className="text-sm font-extrabold text-ink">{titulo.trim() || "Título de la notificación"}</p>
          <p className="mt-0.5 text-sm text-slate-brand">{cuerpo.trim() || "El texto del mensaje aparece acá."}</p>
          <p className="mt-1 text-[11px] text-subtle">vita · ahora</p>
        </div>
      </div>
    </div>
  );
}
