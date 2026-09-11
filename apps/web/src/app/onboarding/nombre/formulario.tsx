"use client";

import { useState, useTransition } from "react";
import { VMark } from "@/components/vita/v-mark";
import { StepDots } from "../step-dots";
import { guardarNombreAction, omitirOnboardingAction } from "../actions";

export function FormularioNombre() {
  const [nombre, setNombre] = useState("");
  const [pendiente, startTransition] = useTransition();

  function continuar() {
    if (!nombre.trim()) return;
    startTransition(() => guardarNombreAction(nombre));
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-gradient-to-b from-[#f8fbfc] to-white px-7 pb-8 pt-14">
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
        <div className="font-heading text-[26px] font-extrabold tracking-tight">¿Cómo te llamás?</div>
        <div className="mt-1.5 text-sm text-muted-foreground">Así te voy a llamar dentro de la app.</div>
      </div>

      <div className="z-10 mt-7">
        <input
          autoFocus
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && continuar()}
          placeholder="Tu nombre"
          className="h-14 w-full rounded-full bg-card px-5 text-center text-[17px] font-semibold shadow-[var(--shadow-card,0_8px_24px_rgba(15,33,54,0.06))] outline-none"
        />
      </div>

      <div className="flex-1" />

      <button
        type="button"
        onClick={continuar}
        disabled={!nombre.trim() || pendiente}
        className="z-10 h-14 w-full rounded-full font-heading text-[15px] font-bold text-white transition-opacity disabled:opacity-55"
        style={{ background: "linear-gradient(135deg, var(--primary), #0e7490)" }}
      >
        Continuar
      </button>
    </div>
  );
}
