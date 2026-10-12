import type { UsoDiario } from "@/lib/uso-ia/tipos";

// Barra de uso diario de vita. Teal mientras quede más del 25%, ámbar
// (chip-amber) con ≤25% y destructive al llegar a 0. Server-safe: sin hooks.
export function barraUsoTono(uso: UsoDiario): "ok" | "poco" | "agotado" {
  const porcentajeRestante = 100 - uso.porcentajeUsado;
  if (uso.restantes <= 0) return "agotado";
  if (porcentajeRestante <= 25) return "poco";
  return "ok";
}

const RELLENO = {
  ok: "bg-primary",
  poco: "bg-chip-amber-ink",
  agotado: "bg-destructive",
} as const;

export function BarraUso({ uso }: { uso: UsoDiario }) {
  const tono = barraUsoTono(uso);
  return (
    <div
      role="progressbar"
      aria-label="Uso de vita hoy"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={uso.porcentajeUsado}
      aria-valuetext={`${uso.porcentajeUsado}% usado`}
      className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
    >
      <div className={`h-full rounded-full transition-[width] duration-300 ${RELLENO[tono]}`} style={{ width: `${uso.porcentajeUsado}%` }} />
    </div>
  );
}

export function textoRestante(uso: UsoDiario): string {
  if (uso.restantes <= 0) return "Llegaste al límite de hoy. vita vuelve a la medianoche.";
  return `Te queda ${100 - uso.porcentajeUsado}% de vita por hoy · se renueva a la medianoche`;
}
