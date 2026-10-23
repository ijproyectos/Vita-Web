import Link from "next/link";
import { VitaIcon } from "@/lib/vita-icons";
import { cn } from "@/lib/utils";
import { crearEscala, cuandoAR, type ResumenTipo, type TonoBadge } from "@/lib/mediciones/resumen";
import { META_MEDICION, formatearValor, hrefNuevaMedicion } from "@/lib/mediciones/tipos";

const CLASES_BADGE: Record<TonoBadge, string> = {
  ok: "bg-chip-teal-bg text-chip-teal-ink",
  aviso: "bg-aviso-tint text-aviso-ink",
  neutro: "bg-chip-slate-bg text-chip-slate-ink",
};

export function BadgeMedicion({ badge, className }: { badge: ResumenTipo["badge"]; className?: string }) {
  return (
    <span className={cn("whitespace-nowrap rounded-full px-2 py-[3px] font-bold", CLASES_BADGE[badge.tono], className)}>
      {badge.texto}
    </span>
  );
}

/** Estado vacío compartido por la lista y por la sección de Mi Salud. */
export function EstadoVacioMonitoreo({ puedeEditar, volver }: { puedeEditar: boolean; volver: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-[20px] bg-card px-5 pb-[22px] pt-[26px] text-center shadow-card">
      <div className="flex size-12 items-center justify-center rounded-full bg-persona-1-tint text-persona-1">
        <VitaIcon name="activity" size={22} />
      </div>
      <div className="mt-0.5 font-heading text-[15px] font-extrabold tracking-[-0.02em]">Todavía no hay mediciones</div>
      <div className="max-w-[280px] text-[12.5px] font-medium leading-[1.45] text-subtle text-balance">
        Anotá la presión, la glucemia o el peso y acá vas a ver cómo vienen.
      </div>
      {puedeEditar && (
        <Link
          href={hrefNuevaMedicion({ volver })}
          className="mt-2 inline-flex rounded-full bg-primary px-5 py-[11px] font-heading text-[13.5px] font-extrabold text-primary-foreground shadow-cta-sm"
        >
          Agregar medición
        </Link>
      )}
    </div>
  );
}

/** Tarjeta chica (186px) del carrusel "Monitoreo activo" de Mi Salud. */
export function TarjetaMini({ resumen }: { resumen: ResumenTipo }) {
  const meta = META_MEDICION[resumen.tipo];
  const ultima = resumen.ultima;
  if (!ultima) return null;
  const valores = resumen.serie.map((m) => m.valor);
  const escala = crearEscala(valores, 36, 32);
  // El gráfico mini usa 158px de ancho: el viewBox de la escala es 300.
  const k = 158 / 300;
  const n = valores.length;
  const lastX = escala.x(n - 1) * k;
  const lastY = escala.y(valores[n - 1]);
  const puntos = valores.map((v, i) => `${(escala.x(i) * k).toFixed(1)},${escala.y(v).toFixed(1)}`).join(" ");

  return (
    <Link
      href={`/app/mi-salud/monitoreo/${resumen.tipo}`}
      className="w-[186px] shrink-0 rounded-[18px] bg-card p-3.5 shadow-card transition-transform active:scale-[0.98] motion-reduce:transition-none"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="eyebrow !tracking-[0.14em]" style={{ color: meta.color }}>
          {meta.nombre}
        </div>
        <BadgeMedicion badge={resumen.badge} className="text-[10px]" />
      </div>
      <div className="mt-2.5">
        <span className="text-[26px] font-bold tracking-[-0.04em] tabular-nums">{formatearValor(ultima)}</span>
        <span className="ml-[5px] text-[11.5px] font-bold text-subtle">{meta.unidad}</span>
      </div>
      <div className="mt-0.5 text-[11px] font-medium text-subtle">{cuandoAR(ultima.medido_at)}</div>
      <svg width="158" height="40" viewBox="0 0 158 40" className="mt-2.5 block overflow-visible" aria-hidden>
        {n > 1 && (
          <polyline
            points={puntos}
            fill="none"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ stroke: meta.color }}
          />
        )}
        <circle cx={lastX} cy={lastY} r="3.2" style={{ fill: meta.color }} />
      </svg>
    </Link>
  );
}
