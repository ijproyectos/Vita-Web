import type { ReactNode } from "react";
import { VitaIcon } from "@/lib/vita-icons";
import { cn } from "@/lib/utils";
import type { ValorEstudio } from "@/lib/estudios/tipos";
import { BotonCompartir, BotonVerArchivo, BotonVolver, EliminarEstudio } from "./acciones-estudio";

export type DatosDetalle = {
  id: string;
  titulo: string;
  meta: string;
  nombreArchivo: string;
  tipoArchivo: "PDF" | "FOTO";
  url: string | null;
  resumen: string;
  valores: ValorEstudio[];
};

function numero(n: number): string {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(n);
}

// Solo lo que la extracción devolvió: nunca se completa un rango propio.
function textoRango(v: ValorEstudio): string | null {
  if (v.rango_texto) return v.rango_texto;
  const min = v.rango_min ?? null;
  const max = v.rango_max ?? null;
  if (min !== null && max !== null) return `${numero(min)} – ${numero(max)}`;
  if (min !== null) return `desde ${numero(min)}`;
  if (max !== null) return `hasta ${numero(max)}`;
  return null;
}

export function DetalleEstudio({ datos, puedeEditar, banner }: { datos: DatosDetalle; puedeEditar: boolean; banner?: ReactNode }) {
  const archivo = { nombreArchivo: datos.nombreArchivo, esPdf: datos.tipoArchivo === "PDF", url: datos.url };
  return (
    <>
      <div className="flex items-center gap-3 mt-1.5">
        <BotonVolver />
        <div className="min-w-0">
          <div className="eyebrow text-primary">Estudio</div>
          <h1 className="mt-0.5 font-heading text-2xl font-extrabold tracking-[-0.5px] text-balance">{datos.titulo}</h1>
          {datos.meta && <div className="mt-0.5 text-[12.5px] font-semibold text-subtle">{datos.meta}</div>}
        </div>
      </div>

      {banner}

      <BotonVerArchivo archivo={archivo}>
        <div className="flex h-16 w-[52px] shrink-0 flex-col justify-end gap-1 rounded-[10px] border border-foreground/[0.07] bg-canvas p-[7px]">
          <div className="h-[3px] rounded-sm bg-line" />
          <div className="h-[3px] w-[70%] rounded-sm bg-line" />
          <div className="mt-[3px] text-[9px] font-extrabold tracking-[0.08em] text-slate-brand">{datos.tipoArchivo}</div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-heading text-[14.5px] font-extrabold tracking-[-0.25px]">{datos.nombreArchivo}</div>
          <div className="mt-0.5 text-[11.5px] font-medium text-subtle">
            {datos.url ? "Tocá para verlo" : "No se pudo generar el enlace al archivo"}
          </div>
        </div>
        <VitaIcon name="chevron-right" size={18} strokeWidth={2.2} className="text-faint" />
      </BotonVerArchivo>

      <div className="rounded-[20px] bg-card p-4 shadow-card">
        <div className="eyebrow text-subtle">Lo que dice</div>
        <p className="mt-1.5 text-[15px] font-bold leading-[1.4] tracking-[-0.2px] text-pretty">{datos.resumen}</p>
        {datos.valores.length > 0 && (
          <div className="mt-3 border-t border-line-soft">
            {datos.valores.map((v, i) => {
              const rango = textoRango(v);
              const fuera = v.estado === "alto" || v.estado === "bajo";
              return (
                <div key={`${v.nombre}-${i}`} className="flex items-center gap-2.5 border-b border-line-soft py-[11px]">
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-bold">{v.nombre}</div>
                    {rango && <div className="mt-px text-[11px] font-medium tabular-nums text-subtle">Normal: {rango}</div>}
                  </div>
                  {fuera && (
                    <span className="rounded-full bg-destructive/10 px-2 py-[3px] text-[10.5px] font-extrabold text-destructive">
                      {v.estado === "alto" ? "Alto" : "Bajo"}
                    </span>
                  )}
                  <div className={cn("shrink-0 whitespace-nowrap text-sm font-extrabold tabular-nums", fuera && "text-destructive")}>
                    {v.valor} {v.unidad && <span className="text-[11px] font-semibold text-subtle">{v.unidad}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-3 text-[11.5px] font-medium leading-[1.4] text-subtle">Resumen de vita. No reemplaza la lectura del médico.</p>
      </div>

      <BotonCompartir titulo={datos.titulo} archivo={archivo} />

      {puedeEditar && <EliminarEstudio id={datos.id} />}
    </>
  );
}
