"use client";

import { useState, useTransition } from "react";
import { VMark } from "@/components/vita/v-mark";
import { VitaIcon } from "@/lib/vita-icons";
import { cn } from "@/lib/utils";
import { StepDots } from "../step-dots";
import { guardarUsoAppAction, omitirOnboardingAction } from "../actions";
import type { UsoApp } from "@/lib/perfil/tipos";

const OPCIONES: { valor: UsoApp; titulo: string; sub: string; icon: string }[] = [
  { valor: "yo", titulo: "Para mí", sub: "Voy a llevar mi propia salud al día", icon: "user" },
  { valor: "cuido", titulo: "Para alguien que cuido", sub: "Un familiar o alguien a quien acompaño", icon: "heart" },
  { valor: "ambos", titulo: "Para las dos cosas", sub: "Mi salud y la de alguien que cuido", icon: "users" },
];

// Paso nuevo, antes de "¿cómo te llamás?" — respuesta a `uso_app`, se
// pregunta una sola vez (ver lib/perfil/nucleo.ts#guardarUsoApp). Mismo
// shell visual que onboarding/nombre/formulario.tsx (plain screen, no la
// burbuja de chat).
export function FormularioParaQuien() {
  const [seleccion, setSeleccion] = useState<UsoApp | null>(null);
  const [pendiente, startTransition] = useTransition();

  function continuar() {
    if (!seleccion) return;
    startTransition(() => guardarUsoAppAction(seleccion));
  }

  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col overflow-hidden bg-gradient-to-b from-[#f8fbfc] to-white px-7 pb-8 pt-14">
      <div
        className="pointer-events-none absolute left-1/2 top-[-140px] size-[340px] -translate-x-1/2 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(8,145,178,0.12), transparent 60%)" }}
      />

      <div className="z-10 flex items-center justify-between">
        <StepDots total={3} activo={0} />
        <button
          type="button"
          onClick={() => startTransition(() => omitirOnboardingAction())}
          className="text-sm font-semibold text-primary"
        >
          Omitir
        </button>
      </div>

      <div className="z-10 mt-7 flex justify-center">
        <div className="flex size-16 items-center justify-center overflow-hidden rounded-full shadow-[0_14px_36px_rgba(8,145,178,0.28)]">
          <div className="flex size-full items-center justify-center" style={{ background: "linear-gradient(135deg, #22d3ee, #0e7490)" }}>
            <VMark size={42} />
          </div>
        </div>
      </div>

      <div className="z-10 mt-7.5 text-center">
        <div className="font-heading text-[26px] font-extrabold tracking-tight">¿Para quién vas a usar la app?</div>
        <div className="mt-1.5 text-sm text-muted-foreground">Así te mostramos las pantallas que necesitás.</div>
      </div>

      <div className="z-10 mt-7 flex flex-col gap-2.5">
        {OPCIONES.map((op) => {
          const sel = seleccion === op.valor;
          return (
            <button
              key={op.valor}
              type="button"
              onClick={() => setSeleccion(op.valor)}
              className={cn(
                "flex items-center gap-3 rounded-[20px] p-4 text-left transition-all",
                sel
                  ? "bg-primary text-primary-foreground shadow-[0_10px_24px_rgba(8,145,178,0.3)]"
                  : "bg-card text-foreground shadow-[var(--shadow-card,0_8px_24px_rgba(15,33,54,0.06))]"
              )}
            >
              <div
                className={cn(
                  "flex size-11 shrink-0 items-center justify-center rounded-full",
                  sel ? "bg-white/20" : "bg-secondary text-primary"
                )}
              >
                <VitaIcon name={op.icon} size={20} color={sel ? "#fff" : undefined} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-heading text-[15px] font-bold">{op.titulo}</div>
                <div className={cn("mt-0.5 text-[12.5px]", sel ? "text-white/85" : "text-muted-foreground")}>{op.sub}</div>
              </div>
              {sel && <VitaIcon name="check" size={18} color="#fff" />}
            </button>
          );
        })}
      </div>

      <div className="flex-1" />

      <button
        type="button"
        onClick={continuar}
        disabled={!seleccion || pendiente}
        className="z-10 h-14 w-full rounded-full font-heading text-[15px] font-bold text-white transition-opacity disabled:opacity-55"
        style={{ background: "linear-gradient(135deg, var(--primary), #0e7490)" }}
      >
        Continuar
      </button>
    </div>
  );
}
