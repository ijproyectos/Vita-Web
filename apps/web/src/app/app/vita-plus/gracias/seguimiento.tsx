"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { VitaIcon } from "@/lib/vita-icons";
import { fechaLarga, type EstadoVitaPlus } from "@/lib/vita-plus/planes";

type Fase = "esperando" | "listo" | "fallo" | "demora";

// Espera (ms) entre consultas: el webhook puede tardar unos segundos o minutos en llegar.
const ESPERAS_MS = [1500, 2000, 3000, 4000, 6000, 8000, 10000, 12000, 15000, 15000];

async function consultar(): Promise<EstadoVitaPlus | null> {
  try {
    const r = await fetch("/api/vita-plus", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "estado" }),
    });
    if (!r.ok) return null;
    const datos = (await r.json()) as { estado?: EstadoVitaPlus };
    return datos.estado ?? null;
  } catch {
    return null;
  }
}

export function Seguimiento() {
  const [fase, setFase] = useState<Fase>("esperando");
  const [estado, setEstado] = useState<EstadoVitaPlus | null>(null);

  useEffect(() => {
    let cancelado = false;
    let timer: number | undefined;
    const paso = async (intento: number) => {
      const e = await consultar();
      if (cancelado) return;
      if (e) setEstado(e);
      if (e?.activo) return setFase("listo");
      if (e && e.estado === "cancelled") return setFase("fallo");
      if (intento >= ESPERAS_MS.length) return setFase("demora");
      timer = window.setTimeout(() => void paso(intento + 1), ESPERAS_MS[intento]);
    };
    void paso(0);
    return () => {
      cancelado = true;
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 bg-canvas px-6 text-center">
      <div
        className={
          fase === "listo"
            ? "flex size-16 items-center justify-center rounded-full bg-primary text-primary-foreground"
            : "flex size-16 items-center justify-center rounded-full bg-muted text-slate-brand"
        }
      >
        <VitaIcon name={fase === "listo" ? "check" : fase === "fallo" ? "alert-triangle" : "clock"} size={28} strokeWidth={2.4} />
      </div>
      {fase === "listo" && (
        <>
          <h1 className="font-heading text-[26px] font-extrabold tracking-[-0.04em]">
            Ya sos vita<span className="text-aviso">+</span>
          </h1>
          <p className="text-[14px] font-medium text-slate-brand">
            {estado?.venceAt ? `Tu suscripción está activa hasta el ${fechaLarga(estado.venceAt)}.` : "Tu suscripción está activa."}
          </p>
        </>
      )}
      {fase === "esperando" && (
        <>
          <h1 className="font-heading text-[24px] font-extrabold tracking-[-0.04em]">Confirmando tu pago…</h1>
          <p className="text-[14px] font-medium text-slate-brand">Puede tardar unos segundos. No cierres esta pantalla.</p>
        </>
      )}
      {fase === "demora" && (
        <>
          <h1 className="font-heading text-[24px] font-extrabold tracking-[-0.04em]">Todavía lo estamos procesando</h1>
          <p className="text-[14px] font-medium text-slate-brand">
            Mercado Pago a veces demora unos minutos en avisarnos. Cuando llegue, vita+ se activa solo: lo vas a ver en tu Perfil.
          </p>
        </>
      )}
      {fase === "fallo" && (
        <>
          <h1 className="font-heading text-[24px] font-extrabold tracking-[-0.04em]">No pudimos completar la suscripción</h1>
          <p className="text-[14px] font-medium text-slate-brand">Podés volver a intentarlo cuando quieras. Si ves un cobro en Mercado Pago, escribinos y lo resolvemos.</p>
        </>
      )}
      <Link
        href={fase === "fallo" ? "/app/vita-plus" : "/app/perfil"}
        className="mt-2 rounded-full bg-ink px-6 py-3 text-[14px] font-extrabold text-on-ink"
      >
        {fase === "fallo" ? "Volver a intentar" : "Ir a mi Perfil"}
      </Link>
    </div>
  );
}
