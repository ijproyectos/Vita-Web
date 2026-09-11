export function StepDots({ total, activo }: { total: number; activo: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className="h-1.5 rounded-full transition-all"
          style={{
            width: i === activo ? 20 : 6,
            background: i === activo ? "var(--primary)" : "var(--border)",
          }}
        />
      ))}
    </div>
  );
}
