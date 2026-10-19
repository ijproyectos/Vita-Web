// Anillo de progreso circular — muestra el % real de adherencia de hoy.
// `tono="primario"` (default) es el anillo blanco para fondos teal; `"card"`
// es el de V7 sobre tarjeta blanca (pista gris, trazo teal).
export function ProgressRing({
  pct,
  size = 68,
  tono = "primario",
}: {
  pct: number;
  size?: number;
  tono?: "primario" | "card";
}) {
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  const off = c - (pct / 100) * c;
  const sobreCard = tono === "card";
  return (
    <div
      className="relative"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${pct}% de las tomas de hoy`}
    >
      <svg width={size} height={size} aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={sobreCard ? "var(--secondary)" : "color-mix(in srgb, var(--primary-foreground) 25%, transparent)"}
          strokeWidth={6}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={sobreCard ? "var(--primary)" : "var(--primary-foreground)"}
          strokeWidth={6}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={off}
          className="motion-reduce:transition-none"
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div
        className={
          "absolute inset-0 flex items-center justify-center font-heading text-[17px] font-extrabold tabular-nums tracking-tight " +
          (sobreCard ? "text-foreground" : "text-primary-foreground")
        }
      >
        {pct}%
      </div>
    </div>
  );
}
