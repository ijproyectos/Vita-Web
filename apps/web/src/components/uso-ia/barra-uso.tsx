import type { UsoDiario } from "@/lib/uso-ia/tipos";
import { textoConsultasRestantes } from "@/lib/uso-ia/interacciones-logica";

// Barra de uso diario de vita. Teal mientras quede más del 25%, ámbar
// (chip-amber) con ≤25% y destructive al llegar a 0. Server-safe: sin hooks.
export function barraUsoTono(uso: UsoDiario): "ok" | "poco" | "agotado" {
  const porcentajeRestante = 100 - uso.porcentajeUsado;
  if (uso.restantes <= 0 || (uso.consultas && uso.consultas.restantes <= 0)) return "agotado";
  const pocasConsultas = !!uso.consultas && uso.consultas.limite > 0 && uso.consultas.restantes / uso.consultas.limite <= 0.25;
  if (porcentajeRestante <= 25 || pocasConsultas) return "poco";
  return "ok";
}

/** ¿No queda cupo? Por dólares o por consultas del día (lo que se agote primero). */
export function sinCupo(uso: UsoDiario | null): boolean {
  if (!uso) return false;
  return uso.restantes <= 0 || (!!uso.consultas && uso.consultas.restantes <= 0);
}

/** Línea del indicador de consultas ("Te quedan 12 consultas hoy"), o null si no se conoce. */
export function textoConsultas(uso: UsoDiario): string | null {
  return uso.consultas ? textoConsultasRestantes(uso.consultas) : null;
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
