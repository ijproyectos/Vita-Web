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
    <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col overflow-hidden bg-gradient-to-b from-background to-card px-7 pb-8 pt-14">
      <div
        className="pointer-events-none absolute left-1/2 top-[-140px] size-[340px] -translate-x-1/2 rounded-full"
        style={{ background: "radial-gradient(circle, color-mix(in srgb, var(--primary) 12%, transparent), transparent 60%)" }}
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
        <VMark size={64} />
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
                  ? "bg-primary text-primary-foreground shadow-[0_10px_24px_color-mix(in_srgb,var(--primary)_30%,transparent)]"
                  : "bg-card text-foreground shadow-card"
              )}
            >
              <div
                className={cn(
                  "flex size-11 shrink-0 items-center justify-center rounded-full",
                  sel ? "bg-primary-foreground/20" : "bg-secondary text-primary"
                )}
              >
                <VitaIcon name={op.icon} size={20} color={sel ? "var(--primary-foreground)" : undefined} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-heading text-[15px] font-bold">{op.titulo}</div>
                <div className={cn("mt-0.5 text-[12.5px]", sel ? "text-primary-foreground/85" : "text-muted-foreground")}>{op.sub}</div>
              </div>
              {sel && <VitaIcon name="check" size={18} color="var(--primary-foreground)" />}
            </button>
          );
        })}
      </div>

      <div className="flex-1" />

      <button
        type="button"
        onClick={continuar}
        disabled={!seleccion || pendiente}
        className="z-10 h-14 w-full rounded-full font-heading text-[15px] font-bold text-primary-foreground transition-opacity disabled:opacity-55"
        style={{ background: "linear-gradient(135deg, var(--brand-from), var(--brand-to))" }}
      >
        Continuar
      </button>
    </div>
  );
}
