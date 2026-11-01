import Link from "next/link";
import type { ReactNode } from "react";
import { chipInactividad } from "@/lib/admin/formato";
import { VitaIcon } from "@/lib/vita-icons";

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
    neutro: "bg-panel-track text-slate-brand",
    ok: "bg-success/15 text-success",
    aviso: "bg-aviso-tint text-aviso-ink",
    alerta: "bg-destructive/10 text-destructive",
  }[tono];
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ${clases}`}>{children}</span>;
}

const CARD = "rounded-[28px] bg-card shadow-panel";
const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal";

export function Card({
  titulo,
  subtitulo,
  href,
  icono,
  children,
  className = "",
}: {
  titulo?: string;
  subtitulo?: string;
  href?: string;
  icono?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`${CARD} p-5 ${className}`}>
      {titulo || href ? (
        <header className="mb-3 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {icono ? (
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-panel-track text-slate-brand">
                <VitaIcon name={icono} size={18} />
              </span>
            ) : null}
            <div className="min-w-0">
              {titulo ? <h2 className="text-[15px] font-extrabold tracking-tight text-ink">{titulo}</h2> : null}
              {subtitulo ? <p className="text-xs text-subtle">{subtitulo}</p> : null}
            </div>
          </div>
          {href ? <BotonFlecha href={href} etiqueta={`Ir a ${titulo ?? "la sección"}`} /> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function BotonFlecha({ href, etiqueta, sobreColor = false }: { href: string; etiqueta: string; sobreColor?: boolean }) {
  return (
    <Link
      href={href}
      aria-label={etiqueta}
      className={`flex size-10 shrink-0 items-center justify-center rounded-full transition-colors motion-reduce:transition-none ${FOCO} ${
        sobreColor ? "bg-on-ink/20 text-on-ink hover:bg-on-ink/30" : "bg-panel-track text-slate-brand hover:bg-line"
      }`}
    >
      <VitaIcon name="arrow-up-right" size={18} />
    </Link>
  );
}

// "US$ 1.234,56" -> los decimales van en gris, como en la referencia.
export function Cifra({ valor, tenue = "text-subtle" }: { valor: ReactNode; tenue?: string }) {
  if (typeof valor !== "string") return <>{valor}</>;
  const m = /^(.*?)(,\d+)(\D*)$/.exec(valor);
  if (!m) return <>{valor}</>;
  return (
    <>
      {m[1]}
      <span className={tenue}>{m[2]}</span>
      {m[3]}
    </>
  );
}

export function Badge({ children, tono = "ok" }: { children: ReactNode; tono?: "ok" | "neutro" | "alerta" | "sobreColor" }) {
  const clases = {
    ok: "bg-mint text-teal-deep",
    neutro: "bg-panel-track text-slate-brand",
    alerta: "bg-destructive/10 text-destructive",
    sobreColor: "bg-on-ink/20 text-on-ink",
  }[tono];
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ${clases}`}>{children}</span>;
}

export function Kpi({
  titulo,
  valor,
  detalle,
  tono = "neutro",
  href,
}: {
  titulo: string;
  valor: ReactNode;
  detalle?: ReactNode;
  tono?: "neutro" | "alerta" | "ok";
  href?: string;
}) {
  return (
    <div className={`${CARD} flex flex-col justify-between gap-2 p-5`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-semibold text-slate-brand">{titulo}</p>
        {href ? <BotonFlecha href={href} etiqueta={`Ir a ${titulo}`} /> : null}
      </div>
      <p className={`text-[28px] font-extrabold leading-none tracking-[-0.04em] ${tono === "alerta" ? "text-destructive" : "text-ink"}`}>
        <Cifra valor={valor} />
      </p>
      {detalle ? (
        <p className="text-xs text-subtle">
          {tono === "ok" ? <Badge>{detalle}</Badge> : detalle}
        </p>
      ) : null}
    </div>
  );
}

// Tarjeta protagonista, rellena con el color de marca (la "VISA" de la referencia).
export function Hero({
  titulo,
  subtitulo,
  valor,
  detalle,
  href,
  pie,
}: {
  titulo: string;
  subtitulo?: string;
  valor: ReactNode;
  detalle?: ReactNode;
  href?: string;
  pie?: ReactNode;
}) {
  return (
    <section className="flex flex-col justify-between gap-6 rounded-[28px] bg-gradient-to-br from-brand-from to-brand-to p-5 text-on-ink shadow-panel">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-extrabold tracking-tight">{titulo}</h2>
          {subtitulo ? <p className="text-xs opacity-80">{subtitulo}</p> : null}
        </div>
        {href ? <BotonFlecha href={href} etiqueta={`Ir a ${titulo}`} sobreColor /> : null}
      </header>
      <div>
        <p className="text-4xl font-extrabold leading-none tracking-[-0.04em]">
          <Cifra valor={valor} tenue="opacity-60" />
        </p>
        {detalle ? <p className="mt-2 text-xs opacity-85">{detalle}</p> : null}
      </div>
      {pie ? <div className="text-xs font-semibold opacity-90">{pie}</div> : null}
    </section>
  );
}

export function Seccion({ titulo, children, accion }: { titulo: string; children: ReactNode; accion?: ReactNode }) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between gap-3 px-1">
        <h2 className="text-lg font-extrabold tracking-tight text-ink">{titulo}</h2>
        {accion}
      </div>
      {children}
    </section>
  );
}

// Selector en pills ("Monthly / Annually"): el activo va relleno con el color de marca.
export function Toggle({
  opciones,
  etiqueta,
}: {
  opciones: { href: string; texto: string; activo: boolean }[];
  etiqueta: string;
}) {
  return (
    <nav aria-label={etiqueta} className="inline-flex gap-1 rounded-full bg-panel-track p-1">
      {opciones.map((o) => (
        <Link
          key={o.href}
          href={o.href}
          aria-current={o.activo ? "page" : undefined}
          className={`rounded-full px-4 py-1.5 text-xs font-bold transition-colors motion-reduce:transition-none ${FOCO} ${
            o.activo ? "bg-teal text-on-ink" : "text-slate-brand hover:text-ink"
          }`}
        >
          {o.texto}
        </Link>
      ))}
    </nav>
  );
}

// Pill de filtro (usuarios): misma familia visual que Toggle pero suelto.
export function PillFiltro({ href, activo, children }: { href: string; activo: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={activo ? "page" : undefined}
      className={`rounded-full px-3.5 py-1.5 text-xs font-bold shadow-panel ${FOCO} ${activo ? "bg-teal text-on-ink" : "bg-card text-slate-brand hover:text-ink"}`}
    >
      {children}
    </Link>
  );
}

export function Pill({ children, icono }: { children: ReactNode; icono?: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-card px-4 py-2.5 text-sm font-semibold text-ink shadow-panel">
      {icono ? <VitaIcon name={icono} size={16} className="text-slate-brand" /> : null}
      {children}
    </span>
  );
}

export function Avatar({ nombre, className = "" }: { nombre: string; className?: string }) {
  const ini = (nombre.trim().match(/[\p{L}\p{N}]/u)?.[0] ?? "?").toUpperCase();
  return (
    <span
      aria-hidden
      className={`inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-mint text-sm font-extrabold text-teal-deep ${className}`}
    >
      {ini}
    </span>
  );
}

// Encabezado de página. `saludo` pone "Hola, <nombre>" con el nombre en gris, como la referencia.
export function Encabezado({ titulo, nombre, derecha }: { titulo: string; nombre?: string; derecha?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 px-1">
      <h1 className="text-3xl font-extrabold tracking-[-0.04em] text-ink sm:text-4xl">
        {titulo}
        {nombre ? <span className="text-subtle">{nombre}</span> : null}
      </h1>
      {derecha ? <div className="flex flex-wrap items-center gap-2">{derecha}</div> : null}
    </div>
  );
}

export function nombreDeEmail(email: string): string {
  const base = email.split("@")[0]?.split(/[._+\-\d]/)[0] ?? "";
  return base ? base.charAt(0).toLocaleUpperCase("es-AR") + base.slice(1) : "admin";
}

export function fechaPill(): string {
  const partes = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "numeric", month: "short", year: "numeric" }).formatToParts(new Date());
  const v = (t: string) => partes.find((p) => p.type === t)?.value.replace(/\./g, "") ?? "";
  return `${v("day")} ${v("month")} ${v("year")}`;
}

export function Tabla({ children }: { children: ReactNode }) {
  return (
    <div className={`${CARD} overflow-x-auto p-3`}>
      <table className="w-full min-w-[640px] border-separate border-spacing-0 text-left text-sm [&_tbody_tr:hover_td]:bg-panel-row">{children}</table>
    </div>
  );
}

export const TH = "px-4 py-2.5 text-xs font-semibold text-subtle";
export const TD = "px-4 py-3 align-middle text-ink first:rounded-l-2xl last:rounded-r-2xl";

export function Vacio({ children }: { children: ReactNode }) {
  return <p className={`${CARD} p-6 text-sm text-subtle`}>{children}</p>;
}

export function ErrorDatos() {
  return (
    <p role="alert" className="rounded-[28px] bg-destructive/10 p-5 text-sm font-semibold text-destructive">
      No se pudieron leer los datos. Revisá que la migración 045 esté aplicada y volvé a intentar.
    </p>
  );
}

export type Barra = { etiqueta: string; valor: number; detalle: string };

const RAYAS =
  "repeating-linear-gradient(135deg, var(--panel-stripe) 0 2px, transparent 2px 7px), linear-gradient(var(--panel-bar), var(--panel-bar))";

// Barras diarias en CSS puro (sin librería de gráficos): píldoras con rayas, la más alta resaltada con su valor.
export function BarrasDiarias({ barras, titulo, subtitulo }: { barras: Barra[]; titulo: string; subtitulo?: string }) {
  const max = Math.max(...barras.map((b) => b.valor), 0);
  const iMax = max > 0 ? barras.findIndex((b) => b.valor === max) : -1;
  const fmt = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 2 });
  return (
    <figure className={`${CARD} p-5`} aria-label={titulo}>
      <figcaption className="mb-4">
        <p className="text-[15px] font-extrabold tracking-tight text-ink">{titulo}</p>
        {subtitulo ? <p className="text-xs text-subtle">{subtitulo}</p> : null}
      </figcaption>
      <div className="flex gap-2">
        <div className="flex h-40 flex-col justify-between pt-7 text-right text-[11px] text-subtle" aria-hidden>
          <span>{fmt(max)}</span>
          <span>{fmt(max / 2)}</span>
          <span>0</span>
        </div>
        <div className="relative min-w-0 flex-1">
          <div className="pointer-events-none absolute inset-x-0 top-7 bottom-0 flex flex-col justify-between" aria-hidden>
            {[0, 1, 2].map((n) => (
              <div key={n} className="border-t border-dashed border-line" />
            ))}
          </div>
          <div className="relative flex h-40 items-end gap-[3px] pt-7 sm:gap-1" role="list">
            {barras.map((b, i) => {
              const alto = max > 0 ? Math.max((b.valor / max) * 100, b.valor > 0 ? 4 : 0) : 0;
              const resaltada = i === iMax;
              const lado = i < barras.length * 0.2 ? "left-0" : i > barras.length * 0.8 ? "right-0" : "left-1/2 -translate-x-1/2";
              return (
                <div key={`${b.etiqueta}-${i}`} role="listitem" className="relative flex h-full min-w-0 flex-1 items-end" title={`${b.etiqueta}: ${b.detalle}`}>
                  <div
                    className={`relative w-full rounded-full ${resaltada ? "bg-teal-deep" : ""}`}
                    style={{ height: `${alto}%`, minHeight: b.valor > 0 ? 6 : 0, ...(resaltada ? {} : { backgroundImage: RAYAS }) }}
                  >
                    {resaltada ? (
                      <span className={`absolute -top-7 ${lado} whitespace-nowrap rounded-full bg-teal-deep px-2 py-0.5 text-[11px] font-bold text-on-ink`}>
                        {b.detalle}
                      </span>
                    ) : null}
                  </div>
                  <span className="sr-only">{`${b.etiqueta}: ${b.detalle}`}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="mt-2 flex justify-between pl-9 text-[11px] text-subtle">
        <span>{barras[0]?.etiqueta ?? ""}</span>
        <span>{barras[barras.length - 1]?.etiqueta ?? ""}</span>
      </div>
    </figure>
  );
}

// Línea suave con relleno degradado (SVG puro). Curva Catmull-Rom -> Bézier.
export function AreaSuave({ puntos, titulo, subtitulo }: { puntos: Barra[]; titulo: string; subtitulo?: string }) {
  const W = 300;
  const H = 100;
  const max = Math.max(...puntos.map((p) => p.valor), 0) || 1;
  const xy = puntos.map((p, i) => [puntos.length > 1 ? (i / (puntos.length - 1)) * W : W / 2, H - (p.valor / max) * (H - 8) - 4] as const);
  let d = "";
  xy.forEach(([x, y], i) => {
    if (i === 0) {
      d = `M${x},${y}`;
      return;
    }
    const [x0, y0] = xy[i - 1];
    const [xa, ya] = xy[i - 2] ?? [x0, y0];
    const [xb, yb] = xy[i + 1] ?? [x, y];
    d += ` C${x0 + (x - xa) / 6},${y0 + (y - ya) / 6} ${x - (xb - x0) / 6},${y - (yb - y0) / 6} ${x},${y}`;
  });
  const area = xy.length > 0 ? `${d} L${xy[xy.length - 1][0]},${H} L${xy[0][0]},${H} Z` : "";
  return (
    <figure className={`${CARD} overflow-hidden p-5 pb-0`} aria-label={titulo}>
      <figcaption className="mb-3">
        <p className="text-[15px] font-extrabold tracking-tight text-ink">{titulo}</p>
        {subtitulo ? <p className="text-xs text-subtle">{subtitulo}</p> : null}
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="-mx-5 block h-32 w-[calc(100%+2.5rem)]" role="img" aria-label={`${titulo}: ${puntos.map((p) => `${p.etiqueta} ${p.detalle}`).join(", ")}`}>
        <defs>
          <linearGradient id="area-panel" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--teal)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--teal)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {area ? <path d={area} fill="url(#area-panel)" /> : null}
        {d ? <path d={d} fill="none" stroke="var(--teal-deep)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" /> : null}
      </svg>
    </figure>
  );
}
