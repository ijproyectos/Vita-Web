"use client";

import { useState } from "react";
import { VitaIcon } from "@/lib/vita-icons";
import { TEXTO_IOS, useNotificacionesPush } from "./activar-notificaciones";
import { PermisoAvisosSheet } from "./permiso-avisos-sheet";

// "Avisos apagados · Activar avisos" (V7, Home): aparece solo cuando este
// celular NO tiene un aviso activo y se puede hacer algo al respecto.
//   inactivo     -> "Activar avisos" pide el permiso real del navegador.
//   bloqueado    -> abre la hoja de 3 pasos para desbloquearlos en el celular.
//   ios-instalar -> explica cómo instalar vita (el push iOS solo existe en la PWA).
// Sin soporte de push (o mientras se detecta) no se muestra nada.
export function TarjetaAvisosApagados() {
  const { estado, pendiente, activar } = useNotificacionesPush();
  const [explicar, setExplicar] = useState(false);

  if (estado === "cargando" || estado === "activo" || estado === "no-soportado") return null;

  const bloqueado = estado === "bloqueado";
  const ios = estado === "ios-instalar";

  return (
    <>
      <div className="flex flex-col gap-3 rounded-[20px] border-[1.5px] border-aviso/35 bg-card p-4 shadow-card">
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-[13px] bg-aviso-tint text-aviso-ink">
            <VitaIcon name="bell-off" size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="eyebrow text-aviso-ink">Avisos apagados</div>
            <div className="mt-[3px] font-heading text-[15px] font-extrabold tracking-[-0.02em]">No te puedo avisar de tus remedios</div>
            <div className="mt-0.5 text-pretty text-[11.5px] font-medium leading-[1.4] text-subtle">
              {ios ? TEXTO_IOS : bloqueado ? "Tu celular tiene bloqueados los avisos de vita." : "Activalos para que te avise a la hora de cada toma."}
            </div>
          </div>
        </div>
        {!ios && (
          <button
            type="button"
            disabled={pendiente}
            onClick={() => (bloqueado ? setExplicar(true) : activar())}
            className="rounded-full bg-primary py-[13px] text-sm font-extrabold text-primary-foreground shadow-cta disabled:opacity-60"
          >
            {pendiente ? "Activando…" : "Activar avisos"}
          </button>
        )}
      </div>
      <PermisoAvisosSheet abierto={explicar} onCerrar={() => setExplicar(false)} onListo={() => window.location.reload()} />
    </>
  );
}
