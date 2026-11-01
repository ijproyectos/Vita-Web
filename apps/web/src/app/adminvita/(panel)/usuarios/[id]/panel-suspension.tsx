"use client";

import { useState, useTransition } from "react";
import { ETIQUETA_MOTIVO, MOTIVOS_SUSPENSION, NOTA_SUSPENSION_MAX, validarSuspension } from "@/lib/suspensiones/logica";
import type { ResultadoSuspension } from "@/lib/admin/suspensiones";
import { reactivarCuentaAction, suspenderCuentaAction } from "./actions";

const CAMPO = "w-full rounded-2xl bg-panel-track px-4 py-2.5 text-sm font-normal text-ink focus-visible:outline-2 focus-visible:outline-teal";

// Suspender / reactivar con confirmación en la propia página. `protegida` = dueño o administrador: no se ofrece suspender.
export function PanelSuspension({ usuarioId, suspendida, protegida }: { usuarioId: string; suspendida: boolean; protegida: boolean }) {
  const [motivo, setMotivo] = useState<string>("");
  const [nota, setNota] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoSuspension | null>(null);
  const [pendiente, iniciar] = useTransition();

  const validacion = validarSuspension({ motivo, nota });

  function ejecutar(accion: () => Promise<ResultadoSuspension>) {
    iniciar(async () => {
      const r = await accion();
      setResultado(r);
      setConfirmando(false);
      if (r.status === "success") {
        setMotivo("");
        setNota("");
      }
    });
  }

  const mensaje = resultado ? (
    <p role={resultado.status === "error" ? "alert" : "status"} className={`text-sm font-semibold ${resultado.status === "error" ? "text-destructive" : "text-teal-deep"}`}>
      {resultado.mensaje}
    </p>
  ) : null;

  if (protegida) {
    return <p className="rounded-[28px] bg-card p-5 text-sm text-slate-brand shadow-panel">Esta cuenta es de un dueño o administrador del panel: no se puede suspender.</p>;
  }

  if (suspendida) {
    return (
      <div className="flex flex-col gap-3 rounded-[28px] bg-card p-5 shadow-panel">
        <p className="text-sm text-slate-brand">La cuenta está suspendida: no puede ingresar a la app. Reactivarla le devuelve el acceso con todos sus datos.</p>
        {confirmando ? (
          <div role="alertdialog" aria-label="Confirmar reactivación" className="flex flex-col gap-2 rounded-2xl bg-mint p-3">
            <p className="text-sm font-bold text-teal-deep">¿Reactivar esta cuenta?</p>
            <span className="flex gap-2">
              <button type="button" disabled={pendiente} onClick={() => ejecutar(() => reactivarCuentaAction(usuarioId))} className="rounded-full bg-teal px-4 py-1.5 text-xs font-bold text-on-ink disabled:opacity-60">
                {pendiente ? "Reactivando…" : "Sí, reactivar"}
              </button>
              <button type="button" disabled={pendiente} onClick={() => setConfirmando(false)} className="rounded-full border border-line px-4 py-1.5 text-xs font-bold">
                Cancelar
              </button>
            </span>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmando(true)} className="self-start rounded-full bg-teal px-5 py-2 text-sm font-bold text-on-ink">
            Reactivar cuenta
          </button>
        )}
        {mensaje}
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-3 rounded-[28px] bg-card p-5 shadow-panel sm:max-w-xl"
      onSubmit={(e) => {
        e.preventDefault();
        if (validacion.ok) setConfirmando(true);
      }}
    >
      <label className="flex flex-col gap-1 text-xs font-bold text-slate-brand">
        Motivo
        <select value={motivo} onChange={(e) => setMotivo(e.target.value)} className={CAMPO}>
          <option value="">Elegí un motivo</option>
          {MOTIVOS_SUSPENSION.map((m) => (
            <option key={m} value={m}>
              {ETIQUETA_MOTIVO[m]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-bold text-slate-brand">
        Nota interna, solo la ve el equipo ({nota.trim().length}/{NOTA_SUSPENSION_MAX})
        <textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={3} maxLength={NOTA_SUSPENSION_MAX + 40} className={CAMPO} />
      </label>
      <p className="text-xs text-subtle">
        La persona no podrá ingresar y verá el motivo y el correo de soporte. No se borra ni se modifica ningún dato.
      </p>
      {!validacion.ok && (motivo !== "" || nota !== "") ? <p className="text-xs text-destructive">{validacion.mensaje}</p> : null}

      {confirmando && validacion.ok ? (
        <div role="alertdialog" aria-label="Confirmar suspensión" className="flex flex-col gap-2 rounded-2xl bg-aviso-tint p-3">
          <p className="text-sm font-bold text-aviso-ink">¿Suspender esta cuenta por {ETIQUETA_MOTIVO[validacion.motivo].toLowerCase()}?</p>
          <span className="flex gap-2">
            <button type="button" disabled={pendiente} onClick={() => ejecutar(() => suspenderCuentaAction(usuarioId, motivo, nota))} className="rounded-full bg-destructive px-4 py-1.5 text-xs font-bold text-destructive-foreground disabled:opacity-60">
              {pendiente ? "Suspendiendo…" : "Sí, suspender"}
            </button>
            <button type="button" disabled={pendiente} onClick={() => setConfirmando(false)} className="rounded-full border border-line px-4 py-1.5 text-xs font-bold">
              Cancelar
            </button>
          </span>
        </div>
      ) : (
        <button type="submit" disabled={!validacion.ok || pendiente} className="self-start rounded-full bg-destructive px-5 py-2 text-sm font-bold text-destructive-foreground disabled:opacity-50">
          Suspender cuenta
        </button>
      )}
      {mensaje}
    </form>
  );
}
