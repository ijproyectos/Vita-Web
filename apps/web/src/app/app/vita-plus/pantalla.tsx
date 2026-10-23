"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { VitaIcon } from "@/lib/vita-icons";
import { cn } from "@/lib/utils";

const BENEFICIOS = [
  "Historia clínica de cada uno, también de tus hijos",
  "Resumen para llevar al médico",
  "Aviso de remedios por terminarse",
];

const PLANES = [
  { clave: "anual", label: "Anual", precio: "US$ 2,99" },
  { clave: "mensual", label: "Mensual", precio: "US$ 4,99" },
] as const;

// Lugares del diagrama (coordenadas del diseño, viewBox 353x300). Son lugares
// vacíos ilustrativos: no representan personas reales.
const LUGARES = [
  { nombre: "Mamá", x: 70, y: 70 },
  { nombre: "Papá", x: 286, y: 62 },
  { nombre: "Hija", x: 292, y: 236 },
  { nombre: "Hijo", x: 62, y: 238 },
];

const AVISO = "Todavía no está disponible. Por ahora no hay nada para contratar.";

export function PantallaVitaPlus({ inicial }: { inicial: string }) {
  const router = useRouter();
  const [plan, setPlan] = useState<(typeof PLANES)[number]["clave"]>("anual");

  return (
    <div className="fixed inset-0 z-[55] mx-auto flex max-w-md flex-col bg-canvas pt-[max(env(safe-area-inset-top),14px)]">
      <div className="flex shrink-0 items-center justify-between px-[18px] pt-1.5">
        <button
          type="button"
          onClick={() => (window.history.length > 1 ? router.back() : router.push("/app/perfil"))}
          aria-label="Cerrar"
          className="flex size-[38px] items-center justify-center rounded-full bg-card shadow-card transition-transform active:scale-[0.94] motion-reduce:transition-none"
        >
          <VitaIcon name="close" size={15} strokeWidth={2.4} />
        </button>
        <div className="rounded-full bg-ink px-[13px] py-1 text-[15px] font-extrabold tracking-[-0.4px] text-on-ink">
          vita<span className="text-amber">+</span>
        </div>
        <div className="w-[38px]" />
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pt-[18px]">
        <h1 className="text-balance text-center font-heading text-[30px] font-extrabold leading-[1.08] tracking-[-0.045em]">
          Sumá a todos
          <br />
          los que cuidás
        </h1>
        <p className="mt-2 text-center text-[13.5px] font-medium text-slate-brand">
          De tus papás a tus hijos. Tocá un lugar vacío.
        </p>

        <div className="relative mx-auto mt-2.5 h-[300px] w-[353px] max-w-full shrink-0">
          <svg width="353" height="300" viewBox="0 0 353 300" className="absolute inset-0" aria-hidden>
            {LUGARES.map((l) => (
              <line
                key={l.nombre}
                x1="176"
                y1="150"
                x2={l.x}
                y2={l.y}
                strokeWidth="2"
                strokeDasharray="4 6"
                strokeLinecap="round"
                className="stroke-faint"
              />
            ))}
          </svg>
          <div className="absolute left-[176px] top-[150px] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5">
            <div className="flex size-[84px] items-center justify-center rounded-full bg-primary text-[30px] font-extrabold text-primary-foreground shadow-[0_0_0_8px_color-mix(in_srgb,var(--teal)_14%,transparent),0_10px_24px_color-mix(in_srgb,var(--teal)_35%,transparent)]">
              {inicial}
            </div>
            <div className="text-[12.5px] font-extrabold">Vos</div>
          </div>
          {LUGARES.map((l) => (
            <button
              key={l.nombre}
              type="button"
              onClick={() => toast(AVISO)}
              style={{ left: l.x, top: l.y }}
              className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5"
            >
              <span className="flex size-[62px] items-center justify-center rounded-full border-2 border-dashed border-primary/50 bg-card text-[26px] font-extrabold text-primary">
                +
              </span>
              <span className="text-xs font-bold text-subtle">{l.nombre}</span>
            </button>
          ))}
        </div>

        <ul className="mt-1 flex flex-col gap-[9px]">
          {BENEFICIOS.map((b) => (
            <li key={b} className="flex items-center gap-2.5 text-sm font-bold">
              <VitaIcon name="check" size={17} strokeWidth={2.8} className="shrink-0 text-primary" />
              {b}
            </li>
          ))}
        </ul>
        <div className="min-h-4 flex-1" />
      </div>

      <div className="flex shrink-0 flex-col gap-2.5 px-[18px] pb-[max(env(safe-area-inset-bottom),24px)] pt-3.5">
        <div role="radiogroup" aria-label="Plan" className="flex rounded-full bg-muted p-1">
          {PLANES.map((p) => {
            const activo = plan === p.clave;
            return (
              <button
                key={p.clave}
                type="button"
                role="radio"
                aria-checked={activo}
                onClick={() => setPlan(p.clave)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-full px-2 py-2.5 text-[13px] font-bold transition-all motion-reduce:transition-none",
                  activo ? "bg-card text-foreground shadow-item" : "text-slate-brand",
                )}
              >
                {p.label} · {p.precio}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          disabled
          aria-disabled
          className="w-full cursor-not-allowed rounded-full bg-faint py-4 text-[15px] font-extrabold text-on-ink"
        >
          Muy pronto
        </button>
        <p className="text-center text-[11.5px] font-medium text-subtle">
          Todavía no está disponible · no se cobra nada
        </p>
      </div>
    </div>
  );
}
