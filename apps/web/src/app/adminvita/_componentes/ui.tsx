import type { ReactNode } from "react";
import { chipInactividad } from "@/lib/admin/formato";

const TONO_CHIP = {
  activo: "bg-success/15 text-success",
  reciente: "bg-mint text-teal-deep",
  enfriandose: "bg-aviso-tint text-aviso-ink",
  inactivo: "bg-destructive/10 text-destructive",
} as const;

export function ChipInactividad({ dias }: { dias: number | null }) {
  const chip = chipInactividad(dias);
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ${TONO_CHIP[chip.clave]}`}
      title={chip.detalle}
    >
      {chip.etiqueta}
      <span className="font-medium opacity-80">· {chip.detalle}</span>
    </span>
  );
}

export function Etiqueta({ children, tono = "neutro" }: { children: ReactNode; tono?: "neutro" | "ok" | "aviso" | "alerta" }) {
  const clases = {
    neutro: "bg-line-soft text-slate-brand",
    ok: "bg-success/15 text-success",
    aviso: "bg-aviso-tint text-aviso-ink",
    alerta: "bg-destructive/10 text-destructive",
  }[tono];
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ${clases}`}>{children}</span>;
}

export function Kpi({
  titulo,
  valor,
  detalle,
  tono = "neutro",
}: {
  titulo: string;
  valor: ReactNode;
  detalle?: ReactNode;
  tono?: "neutro" | "alerta" | "ok";
}) {
  const borde = tono === "alerta" ? "border-destructive/40" : tono === "ok" ? "border-teal-line" : "border-line";
  return (
    <div className={`rounded-[var(--radius-item)] border bg-paper p-4 shadow-item ${borde}`}>
      <p className="eyebrow">{titulo}</p>
      <p className="mt-1 text-2xl font-extrabold tracking-tight text-ink">{valor}</p>
      {detalle ? <p className="mt-1 text-xs text-subtle">{detalle}</p> : null}
    </div>
  );
}

export function Seccion({ titulo, children, accion }: { titulo: string; children: ReactNode; accion?: ReactNode }) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-extrabold text-ink">{titulo}</h2>
        {accion}
      </div>
      {children}
    </section>
  );
}

export function Tabla({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius-item)] border border-line bg-paper shadow-item">
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">{children}</table>
    </div>
  );
}

export const TH = "border-b border-line-soft px-3 py-2 text-xs font-bold uppercase tracking-wide text-subtle";
export const TD = "border-b border-line-soft px-3 py-2.5 align-middle text-ink";

export function Vacio({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-[var(--radius-item)] border border-dashed border-line bg-paper p-5 text-sm text-subtle">{children}</p>
  );
}

export function ErrorDatos() {
  return (
    <p className="rounded-[var(--radius-item)] border border-destructive/40 bg-destructive/10 p-4 text-sm font-semibold text-destructive">
      No se pudieron leer los datos. Revisá que la migración 045 esté aplicada y volvé a intentar.
    </p>
  );
}

export type Barra = { etiqueta: string; valor: number; detalle: string };

// Barras diarias en CSS puro (sin librería de gráficos). Cada barra mide `valor / máximo`.
export function BarrasDiarias({ barras, titulo }: { barras: Barra[]; titulo: string }) {
  const max = Math.max(...barras.map((b) => b.valor), 0);
  return (
    <figure className="rounded-[var(--radius-item)] border border-line bg-paper p-4 shadow-item" aria-label={titulo}>
      <figcaption className="eyebrow mb-3">{titulo}</figcaption>
      <div className="flex h-36 items-end gap-[3px]" role="list">
        {barras.map((b) => {
          const alto = max > 0 ? Math.max((b.valor / max) * 100, b.valor > 0 ? 3 : 0) : 0;
          return (
            <div key={b.etiqueta} role="listitem" className="group relative flex h-full min-w-0 flex-1 items-end" title={`${b.etiqueta}: ${b.detalle}`}>
              <div className="w-full rounded-t-[3px] bg-teal" style={{ height: `${alto}%` }} />
              <span className="sr-only">{`${b.etiqueta}: ${b.detalle}`}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-subtle">
        <span>{barras[0]?.etiqueta ?? ""}</span>
        <span>{barras.length > 0 ? `máx. ${max.toLocaleString("es-AR", { maximumFractionDigits: 2 })}` : ""}</span>
        <span>{barras[barras.length - 1]?.etiqueta ?? ""}</span>
      </div>
    </figure>
  );
}
