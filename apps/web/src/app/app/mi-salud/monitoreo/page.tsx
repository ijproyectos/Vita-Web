import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import * as medicionesNucleo from "@/lib/mediciones/nucleo";
import { agruparPorTipo, crearEscala, cuandoAR, MINIMO_TARJETA, resumirTipo } from "@/lib/mediciones/resumen";
import { META_MEDICION, TIPOS_MEDICION, formatearValor } from "@/lib/mediciones/tipos";
import { obtenerPerfilActivo } from "@/lib/familia/perfil-activo";
import { BannerPerfil } from "@/components/vita/banner-perfil";
import { VitaIcon } from "@/lib/vita-icons";
import { TopBar } from "../../top-bar";
import { BadgeMedicion, EstadoVacioMonitoreo } from "./componentes";

export default async function MonitoreoPage() {
  await requireUser();
  const supabase = await createClient();
  const activo = await obtenerPerfilActivo();
  const puedeEditar = activo.rol === "editar";

  const mediciones = await medicionesNucleo.listarRecientesSeguro(supabase, activo.id);
  const porTipo = agruparPorTipo(mediciones);
  const tipos = TIPOS_MEDICION.filter((t) => porTipo.has(t));

  return (
    <div className="flex flex-col gap-[18px] px-[18px] pb-10 pt-1.5">
      <TopBar
        eyebrow="Mi salud"
        title="Monitoreo activo"
        accionDerecha={
          puedeEditar ? (
            <Link
              href="/app/mi-salud/monitoreo/agregar"
              aria-label="Agregar una medición"
              className="flex size-[42px] shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-cta-sm transition-transform active:scale-[0.94] motion-reduce:transition-none"
            >
              <VitaIcon name="plus" size={20} strokeWidth={2.4} />
            </Link>
          ) : undefined
        }
      />
      <BannerPerfil perfil={activo} />

      {tipos.length > 0 && (
        <p className="-mt-1.5 px-0.5 text-[13px] font-medium text-slate-brand">
          {tipos.length} {tipos.length === 1 ? "métrica" : "métricas"} · últimas mediciones
        </p>
      )}

      {tipos.length === 0 && <EstadoVacioMonitoreo puedeEditar={puedeEditar} />}

      {tipos.map((tipo) => {
        const resumen = resumirTipo(tipo, porTipo.get(tipo)!);
        const meta = META_MEDICION[tipo];
        const ultima = resumen.ultima!;
        const conGrafico = resumen.n >= MINIMO_TARJETA;
        const valores = resumen.serie.map((m) => m.valor);
        const escala = crearEscala(valores, 66, 58);
        return (
          <div key={tipo} className="rounded-[20px] bg-card p-[18px] shadow-card">
            <Link href={`/app/mi-salud/monitoreo/${tipo}`} className="block">
              <div className="flex items-center justify-between gap-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="size-2 shrink-0 rounded-full" style={{ background: meta.color }} />
                  <span className="font-heading text-[14.5px] font-extrabold tracking-[-0.01em]">{meta.nombre}</span>
                </div>
                <BadgeMedicion badge={resumen.badge} className="px-[9px] py-1 text-[11.5px]" />
              </div>
              <div className="mt-3 flex items-baseline gap-1.5">
                <span className="text-[34px] font-bold leading-none tracking-[-0.04em] tabular-nums">{formatearValor(ultima)}</span>
                <span className="text-[13px] font-bold text-slate-brand">{meta.unidad}</span>
              </div>
              <div className="mt-[5px] text-[12.5px] font-medium text-slate-brand">Última: {cuandoAR(ultima.medido_at)}</div>
              {conGrafico ? (
                <>
                  <svg width="100%" height="76" viewBox="0 0 300 76" preserveAspectRatio="none" className="mt-3.5 block overflow-visible" aria-hidden>
                    <line x1="0" y1="66" x2="300" y2="66" className="stroke-foreground/10" strokeWidth="1" />
                    <line x1="0" y1="8" x2="300" y2="8" className="stroke-foreground/5" strokeWidth="1" strokeDasharray="3 4" />
                    <polyline
                      points={escala.puntos}
                      fill="none"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                      style={{ stroke: meta.color }}
                    />
                  </svg>
                </>
              ) : (
                <div className="mt-3.5 rounded-[14px] bg-secondary px-3.5 py-3 text-[12.5px] font-medium leading-[1.45] text-slate-brand">
                  {resumen.n === 1
                    ? "Con 2 mediciones más armo el gráfico."
                    : "Con 1 medición más armo el gráfico."}
                </div>
              )}
            </Link>
            <div className="mt-3.5 flex items-center justify-between gap-2.5 border-t border-foreground/[0.06] pt-3">
              <div className="text-[12.5px] font-medium text-slate-brand">{resumen.textoPromedio}</div>
              {puedeEditar && (
                <Link
                  href={`/app/mi-salud/monitoreo/agregar?tipo=${tipo}`}
                  className="-my-2 -mr-3 rounded-full px-3 py-2 text-[13px] font-bold text-teal-deep"
                >
                  + Registrar
                </Link>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
