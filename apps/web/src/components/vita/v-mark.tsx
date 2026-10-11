"use client";


// Isotipo de vita. (manual de marca "Cuidado claro"): cuadrado teal con
// radio 30%, "v" crema y punto ambar en la esquina superior derecha
// (diametro 15%, a 20% del borde superior y derecho). Es el ícono plano
// (app icon, pantallas de ingreso); VitaAvatar es el personaje.
export function VMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" role="img" aria-label="vita">
      <rect width="100" height="100" rx="30" fill="var(--teal)" />
      <path
        d="M30 44 L50 73 L70 44"
        stroke="var(--cream)"
        strokeWidth="11"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="72.5" cy="27.5" r="7.5" fill="var(--amber)" />
    </svg>
  );
}

// El personaje 3D vive en vita-avatar.tsx; se re-exporta acá para que los
// call sites existentes sigan importando desde "v-mark".
export { VitaAvatar } from "./vita-avatar";

type TonoWordmark = "claro" | "teal" | "tinta" | "menta";

const COLORES_WORDMARK: Record<TonoWordmark, { texto: string; punto: string }> = {
  claro: { texto: "var(--ink)", punto: "var(--amber)" },
  teal: { texto: "var(--cream)", punto: "var(--amber)" },
  tinta: { texto: "var(--cream)", punto: "var(--teal)" },
  menta: { texto: "var(--teal-deep)", punto: "var(--ink)" },
};

// Wordmark "vita" + punto ambar. `solo` omite el isotipo (ej. login, donde
// ya va grande arriba).
export function VitaWordmark({
  size = 26,
  tono = "claro",
  solo = false,
}: {
  size?: number;
  tono?: TonoWordmark;
  solo?: boolean;
}) {
  const c = COLORES_WORDMARK[tono];
  return (
    <div className="flex items-center gap-2">
      {!solo && <VMark size={size} />}
      <span
        className="font-heading font-extrabold"
        style={{ fontSize: size * 0.8, letterSpacing: "-0.06em", color: c.texto }}
      >
        vita<span style={{ color: c.punto }}>.</span>
      </span>
    </div>
  );
}
