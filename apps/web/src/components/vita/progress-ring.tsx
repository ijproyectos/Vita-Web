// Anillo de progreso circular — porta ProgressRing de HomeScreen.jsx /
// RutinaScreen.jsx. Muestra el % real de adherencia de hoy.
export function ProgressRing({ pct, size = 68 }: { pct: number; size?: number }) {
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  const off = c - (pct / 100) * c;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="color-mix(in srgb, var(--primary-foreground) 25%, transparent)" strokeWidth={6} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="var(--primary-foreground)"
          strokeWidth={6}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={off}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center font-heading text-[18px] font-extrabold tracking-tight text-primary-foreground">
        {pct}%
      </div>
    </div>
  );
}
