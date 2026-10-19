"use client";


// Isotipo de vita (V7): "V" blanca redondeada sobre teal, con un punto ambar
// (el "latido") y un punto menta. Trazado a partir de assets/vita-logo-teal.png
// del diseño. Es el ícono plano (app icon, FAB del bottom nav, pantallas de
// ingreso); VitaAvatar es el personaje.
// `forma="cuadrado"` (default) es el app icon con radio 30%; `"circulo"` es la
// variante del FAB central.
export function VMark({
  size = 30,
  forma = "cuadrado",
  className,
}: {
  size?: number;
  forma?: "cuadrado" | "circulo";
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="144 160 965 965"
      fill="none"
      role="img"
      aria-label="vita"
      className={className}
    >
      <rect
        x="144"
        y="160"
        width="965"
        height="965"
        rx={forma === "circulo" ? 482.5 : 290}
        fill="var(--teal)"
      />
      <path
        d="M410 395C445 395 470 415 487 440L612 696C640 745 695 785 775 742L720 840C690 890 650 915 608 915C560 915 520 890 497 840L335 520C318 485 322 405 410 395Z"
        fill="var(--primary-foreground)"
      />
      <circle cx="722" cy="648" r="87" fill="var(--mint-soft)" />
      <circle cx="837" cy="459" r="90" fill="var(--amber)" />
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
