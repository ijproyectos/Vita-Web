// Marca "v" geométrica de vita.ia — porta VMark/VitaAvatar/VitaWordmark de
// Shell.jsx del diseño original.
export function VMark({ size = 30, color = "#fff" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <path
        d="M6 8.5 L13.5 23.5 A2 2 0 0 0 17.5 23.5 L26 8.5"
        stroke={color}
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="14" r="1.5" fill={color} opacity="0.9" />
    </svg>
  );
}

export function VitaAvatar({ size = 36 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        overflow: "hidden",
        flexShrink: 0,
        background: "linear-gradient(135deg, #22d3ee, #0e7490)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <VMark size={size * 0.7} />
    </div>
  );
}

export function VitaWordmark({ size = 26 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2">
      <VitaAvatar size={size} />
      <span
        className="font-heading font-extrabold tracking-tight"
        style={{ fontSize: size * 0.68, color: "var(--foreground)" }}
      >
        vita<span style={{ color: "var(--primary)" }}>.ia</span>
      </span>
    </div>
  );
}
