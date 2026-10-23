import Link from "next/link";
import { VitaIcon } from "@/lib/vita-icons";
import { cn } from "@/lib/utils";

// Piezas compartidas por Perfil y sus subpantallas (V7): grupo con eyebrow,
// y filas con tile de ícono tonal. Server-safe (sin estado).

export type TonoFila = "neutral" | "teal" | "violet" | "amber" | "rose";

const CLASES_TONO: Record<TonoFila, string> = {
  neutral: "bg-secondary text-slate-brand",
  teal: "bg-persona-1-tint text-persona-1-deep",
  violet: "bg-persona-2-tint text-persona-2",
  amber: "bg-aviso-tint text-aviso-ink",
  rose: "bg-chip-rose-bg text-chip-rose-ink",
};

export function Grupo({ titulo, children }: { titulo?: string; children: React.ReactNode }) {
  return (
    <section>
      {titulo && <h2 className="eyebrow px-0.5 pb-[9px] text-subtle">{titulo}</h2>}
      <div className="overflow-hidden rounded-[20px] bg-card shadow-card">{children}</div>
    </section>
  );
}

export function Tile({ icon, tono = "neutral" }: { icon: string; tono?: TonoFila }) {
  return (
    <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-tile)]", CLASES_TONO[tono])}>
      <VitaIcon name={icon} size={17} />
    </div>
  );
}

const CLASES_FILA = "flex w-full items-center gap-3 px-4 py-3.5 text-left [&:not(:first-child)]:border-t [&:not(:first-child)]:border-foreground/[0.06]";

function Cuerpo({ label, sub, peligro }: { label: string; sub?: string; peligro?: boolean }) {
  return (
    <div className="min-w-0 flex-1">
      <div className={cn("font-heading text-[14.5px] font-extrabold tracking-[-0.02em]", peligro && "text-destructive")}>{label}</div>
      {sub && <div className="mt-0.5 text-[11.5px] font-medium leading-snug text-subtle">{sub}</div>}
    </div>
  );
}

// Fila que navega (ruta interna, o `mailto:`/externo con `externo`).
export function FilaNav({
  icon,
  tono,
  label,
  sub,
  href,
  externo,
  peligro,
}: {
  icon: string;
  tono?: TonoFila;
  label: string;
  sub?: string;
  href: string;
  externo?: boolean;
  peligro?: boolean;
}) {
  const contenido = (
    <>
      <Tile icon={icon} tono={tono} />
      <Cuerpo label={label} sub={sub} peligro={peligro} />
      <VitaIcon name="chevron-right" size={18} className="shrink-0 text-faint" />
    </>
  );
  return externo ? (
    <a href={href} className={CLASES_FILA}>
      {contenido}
    </a>
  ) : (
    <Link href={href} className={CLASES_FILA}>
      {contenido}
    </Link>
  );
}

// Fila informativa, sin acción (ej. una sección que llega en otra fase).
export function FilaInfo({
  icon,
  tono,
  label,
  sub,
  etiqueta,
}: {
  icon: string;
  tono?: TonoFila;
  label: string;
  sub?: string;
  etiqueta?: string;
}) {
  return (
    <div className={CLASES_FILA}>
      <Tile icon={icon} tono={tono} />
      <Cuerpo label={label} sub={sub} />
      {etiqueta && (
        <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-[10.5px] font-bold text-slate-brand">{etiqueta}</span>
      )}
    </div>
  );
}

// Fila de acción (botón de un <form>).
export function FilaAccion({
  icon,
  tono,
  label,
  sub,
  peligro,
}: {
  icon: string;
  tono?: TonoFila;
  label: string;
  sub?: string;
  peligro?: boolean;
}) {
  return (
    <button type="submit" className={CLASES_FILA}>
      <Tile icon={icon} tono={tono} />
      <Cuerpo label={label} sub={sub} peligro={peligro} />
      <VitaIcon name="chevron-right" size={18} className="shrink-0 text-faint" />
    </button>
  );
}
