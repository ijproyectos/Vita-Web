"use client";

import { useState, useTransition } from "react";
import { VitaIcon } from "@/lib/vita-icons";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { IconoTilde } from "@/components/vita/auth-ui";
import { guardarUsoAppAction, omitirIntroAction } from "../actions";
import type { UsoApp } from "@/lib/perfil/tipos";

// "¿Cómo vas a usar Vita?" (V7 `isUse`): dos tarjetas con ícono y radio,
// CTA gris hasta elegir. "Para mi familia" guarda `cuido`; `ambos` se llega
// desde el chat ("¿Querés sumarte vos también?"). Este es el primer paso
// después del login, así que no hay "volver": en su lugar "Omitir" salta la
// intro y va directo a cargar datos (omitirIntroAction).
const OPCIONES: { valor: UsoApp; titulo: string; sub: string; icon: string }[] = [
  { valor: "yo", titulo: "Para mí", sub: "Mis remedios, turnos y controles", icon: "user" },
  { valor: "cuido", titulo: "Para mi familia", sub: "Papás, hijos, pareja… y vos si querés", icon: "users" },
];

export function FormularioParaQuien({ nombre }: { nombre: string | null }) {
  const [seleccion, setSeleccion] = useState<UsoApp | null>(null);
  const [pendiente, startTransition] = useTransition();
  const [omitiendo, startOmitir] = useTransition();

  function continuar() {
    if (!seleccion) return;
    startTransition(async () => {
      const r = await guardarUsoAppAction(seleccion);
      if (r?.status === "error") toast.error(r.message);
    });
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-canvas px-[22px] pb-10 pt-16">
      <div className="flex h-[42px] items-center justify-end">
        <button
          type="button"
          onClick={() => startOmitir(async () => void (await omitirIntroAction()))}
          disabled={omitiendo || pendiente}
          className="rounded-full px-3 py-2 text-sm font-bold text-slate-brand disabled:opacity-60"
        >
          Omitir
        </button>
      </div>

      <div className="mt-7 text-[15px] font-semibold text-slate-brand">{nombre ? `Hola, ${nombre}` : "Hola"}</div>
      <h1 className="mt-1.5 font-heading text-[28px] font-extrabold leading-[1.12] tracking-[-0.04em]">¿Cómo vas a usar Vita?</h1>

      <div className="mt-[26px] flex flex-col gap-3" role="radiogroup" aria-label="¿Cómo vas a usar Vita?">
        {OPCIONES.map((op) => {
          const sel = seleccion === op.valor;
          return (
            <button
              key={op.valor}
              type="button"
              role="radio"
              aria-checked={sel}
              onClick={() => setSeleccion(op.valor)}
              className={cn(
                "flex items-center gap-3.5 rounded-[22px] bg-card p-[18px] text-left transition-shadow",
                sel ? "shadow-[0_0_0_2px_var(--primary),0_6px_20px_color-mix(in_srgb,var(--primary)_15%,transparent)]" : "shadow-card"
              )}
            >
              <div className="flex size-[52px] shrink-0 items-center justify-center rounded-[16px] bg-persona-1-tint text-teal-deep">
                <VitaIcon name={op.icon} size={26} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-heading text-[17px] font-extrabold tracking-[-0.02em]">{op.titulo}</div>
                <div className="mt-[3px] text-[13.5px] font-medium leading-[1.4] text-slate-brand">{op.sub}</div>
              </div>
              <div
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border-2 text-primary-foreground transition-colors",
                  sel ? "border-primary bg-primary" : "border-line-strong bg-card"
                )}
              >
                <span className={sel ? "opacity-100" : "opacity-0"}>
                  <IconoTilde />
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex-1" />

      <button
        type="button"
        onClick={continuar}
        disabled={!seleccion || pendiente}
        className={cn(
          "h-14 w-full rounded-full font-heading text-base font-extrabold text-primary-foreground transition-colors",
          seleccion ? "bg-primary shadow-cta disabled:opacity-60" : "bg-deshabilitado"
        )}
      >
        Seguir
      </button>
    </div>
  );
}
