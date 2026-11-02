"use client";

import { useState, useTransition } from "react";
import { validarEnvioMasivo } from "@/lib/admin/envios-masivos-logica";
import { CUERPO_PUSH_MAX, TITULO_PUSH_MAX } from "@/lib/admin/push-form";
import { crearEnvioMasivoAction, type EstadoEnvioMasivo } from "./actions";

const CAMPO = "w-full rounded-2xl bg-panel-track px-4 py-2.5 text-sm font-normal text-ink focus-visible:outline-2 focus-visible:outline-teal";

export function FormularioEnvioMasivo({ usuarios, dispositivos }: { usuarios: number; dispositivos: number }) {
  const [titulo, setTitulo] = useState("");
  const [cuerpo, setCuerpo] = useState("");
  const [enlace, setEnlace] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [resultado, setResultado] = useState<EstadoEnvioMasivo | null>(null);
  const [pendiente, iniciar] = useTransition();

  const validacion = validarEnvioMasivo({ titulo, cuerpo, enlace });
  const hayDatos = titulo !== "" || cuerpo !== "" || enlace !== "";

  function enviar() {
    iniciar(async () => {
      const r = await crearEnvioMasivoAction(titulo, cuerpo, enlace);
      setResultado(r);
      setConfirmando(false);
      if (r.status === "success") {
        setTitulo("");
        setCuerpo("");
        setEnlace("");
      }
    });
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <form
        className="flex flex-col gap-3 rounded-[28px] bg-card p-5 shadow-panel"
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
        <label className="flex flex-col gap-1 text-xs font-bold text-slate-brand">
          Enlace dentro de la app (opcional)
          <input value={enlace} onChange={(e) => setEnlace(e.target.value)} placeholder="/app/avisos" maxLength={220} className={CAMPO} />
        </label>
        <p className="text-xs text-subtle">
          Es un anuncio del servicio: llega aunque la persona tenga silencio nocturno. Se manda por lotes y queda en el centro de avisos de
          cada persona. Solo puede salir un envío masivo cada 10 minutos.
        </p>
        {!validacion.ok && hayDatos ? <p className="text-xs text-destructive">{validacion.error}</p> : null}

        {confirmando ? (
          <div role="alertdialog" aria-label="Confirmar envío masivo" className="flex flex-col gap-2 rounded-2xl bg-mint p-3">
            <p className="text-sm font-bold text-teal-deep">
              Esto le llega a {usuarios} {usuarios === 1 ? "persona" : "personas"} ({dispositivos} {dispositivos === 1 ? "dispositivo" : "dispositivos"}).
              No se puede deshacer lo que ya salió. ¿Enviar?
            </p>
            <span className="flex gap-2">
              <button type="button" onClick={enviar} disabled={pendiente} className="rounded-full bg-teal px-4 py-1.5 text-xs font-bold text-on-ink disabled:opacity-60">
                {pendiente ? "Creando…" : "Sí, enviar a todos"}
              </button>
              <button type="button" onClick={() => setConfirmando(false)} disabled={pendiente} className="rounded-full border border-line px-4 py-1.5 text-xs font-bold">
                Cancelar
              </button>
            </span>
          </div>
        ) : (
          <button
            type="submit"
            disabled={!validacion.ok || pendiente || usuarios === 0}
            className="self-start rounded-full bg-teal px-5 py-2 text-sm font-bold text-on-ink disabled:opacity-50"
          >
            Enviar a todos
          </button>
        )}
        {resultado ? (
          <p role={resultado.status === "error" ? "alert" : "status"} className={`text-sm font-semibold ${resultado.status === "error" ? "text-destructive" : "text-teal-deep"}`}>
            {resultado.mensaje}
          </p>
        ) : null}
      </form>

      <div aria-label="Vista previa" className="rounded-2xl border border-dashed border-line bg-panel-row p-4">
        <p className="eyebrow">Vista previa</p>
        <div className="mt-2 rounded-[var(--radius-item)] bg-card p-3 shadow-card">
          <p className="text-sm font-extrabold text-ink">{titulo.trim() || "Título de la notificación"}</p>
          <p className="mt-0.5 text-sm text-slate-brand">{cuerpo.trim() || "El texto del mensaje aparece acá."}</p>
          <p className="mt-1 text-[11px] text-subtle">vita · ahora</p>
        </div>
        {validacion.ok ? <p className="mt-2 text-xs text-subtle">Al tocarla abre: {validacion.envio.enlace}</p> : null}
      </div>
    </div>
  );
}
