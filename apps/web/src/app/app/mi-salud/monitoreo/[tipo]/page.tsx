import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import * as medicionesNucleo from "@/lib/mediciones/nucleo";
import {
  crearEscala,
  cuandoAR,
  diaAR,
  inicialDia,
  MINIMO_DETALLE,
  momentoYHora,
  resumirTipo,
} from "@/lib/mediciones/resumen";
import {
  AVISO_REFERENCIA,
  ETIQUETA_CONTEXTO,
  META_MEDICION,
  dentroDeRango,
  esTipoMedicion,
  formatearNumero,
  formatearValor,
} from "@/lib/mediciones/tipos";
import { obtenerPerfilActivo } from "@/lib/familia/perfil-activo";
import { BannerPerfil } from "@/components/vita/banner-perfil";
import { VitaIcon } from "@/lib/vita-icons";
import { cn } from "@/lib/utils";
import { TopBar } from "../../../top-bar";
import { BadgeMedicion } from "../componentes";
import { EliminarMedicionButton } from "../eliminar-medicion-button";

export default async function MonitoreoDetallePage(props: PageProps<"/app/mi-salud/monitoreo/[tipo]">) {
  await requireUser();
  const { tipo } = await props.params;
  if (!esTipoMedicion(tipo)) notFound();

  const supabase = await createClient();
  const activo = await obtenerPerfilActivo();
  const puedeEditar = activo.rol === "editar";
  const meta = META_MEDICION[tipo];

  const historial = await medicionesNucleo.listarPorTipoSeguro(supabase, activo.id, tipo);
  const resumen = resumirTipo(tipo, historial);
  const ultima = resumen.ultima;

  const conGrafico = resumen.n >= MINIMO_DETALLE;
  const valores = resumen.serie.map((m) => m.valor);
  const rango = meta.rango;
  const escala = conGrafico ? crearEscala(valores, 140, 118, rango ? [rango.min, rango.max] : [], 0.12) : null;
  const dec = meta.decimales;

  return (
    <div className="flex flex-col gap-[18px] px-[18px] pb-10 pt-1.5">
      <TopBar eyebrow="Monitoreo" title={meta.nombre} />
      <BannerPerfil perfil={activo} />

      {!ultima ? (
        <div className="flex flex-col items-center gap-2 rounded-[20px] bg-card px-5 pb-[22px] pt-[26px] text-center shadow-card">
          <div className="flex size-12 items-center justify-center rounded-full bg-persona-1-tint text-persona-1">
            <VitaIcon name={meta.icono} size={22} />
          </div>
          <div className="mt-0.5 font-heading text-[15px] font-extrabold tracking-[-0.02em]">Todavía no hay mediciones</div>
          <div className="max-w-[280px] text-[12.5px] font-medium leading-[1.45] text-subtle text-balance">
            Cuando anotes tu {meta.nombreMin} vas a ver acá cómo viene.
          </div>
        </div>
      ) : (
        <>
          <div className="rounded-[22px] bg-card px-[18px] pb-4 pt-5 shadow-card">
            <div className="flex items-start justify-between gap-2.5">
              <div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[46px] font-bold leading-none tracking-[-0.05em] tabular-nums">{formatearValor(ultima)}</span>
                  <span className="text-sm font-bold text-slate-brand">{meta.unidad}</span>
                </div>
                <div className="mt-[7px] text-[12.5px] font-medium text-slate-brand">Última: {cuandoAR(ultima.medido_at)}</div>
                {tipo === "presion" && ultima.pulso != null && (
                  <div className="mt-0.5 text-[12.5px] font-medium text-slate-brand">Pulso {formatearNumero(ultima.pulso, 0)} lpm</div>
                )}
                {tipo === "glucemia" && ultima.contexto && (
                  <div className="mt-0.5 text-[12.5px] font-medium text-slate-brand">{ETIQUETA_CONTEXTO[ultima.contexto]}</div>
                )}
              </div>
              <BadgeMedicion badge={resumen.badge} className="px-2.5 py-[5px] text-xs" />
            </div>

            {escala ? (
              <>
                <div className="relative mt-[22px]">
                  <svg width="100%" height="150" viewBox="0 0 300 150" preserveAspectRatio="none" className="block overflow-visible" aria-hidden>
                    {rango && (
                      <rect
                        x="0"
                        y={escala.y(rango.max).toFixed(1)}
                        width="300"
                        height={(escala.y(rango.min) - escala.y(rango.max)).toFixed(1)}
                        className="fill-chip-teal-bg"
                        opacity="0.7"
                      />
                    )}
                    <line x1="0" y1="140" x2="300" y2="140" className="stroke-foreground/10" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                    <polyline
                      points={escala.puntos}
                      fill="none"
                      strokeWidth="2.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                      style={{ stroke: meta.color }}
                    />
                  </svg>
                  {resumen.serie.map((m, i) => (
                    <div
                      key={m.id}
                      className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
                      style={{ left: `${(escala.x(i) / 3).toFixed(2)}%`, top: `${escala.y(m.valor).toFixed(1)}px` }}
                    >
                      <div className="absolute bottom-2.5 whitespace-nowrap text-[11px] font-bold tabular-nums">
                        {formatearNumero(m.valor, dec)}
                      </div>
                      <div className="size-[9px] rounded-full border-[2.4px] bg-card" style={{ borderColor: meta.color }} />
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex justify-between">
                  {resumen.serie.map((m, i) => (
                    <span key={m.id} className="w-[22px] text-center text-[11.5px] font-semibold text-slate-brand">
                      {inicialDia(m.medido_at, i === resumen.serie.length - 1)}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <div className="mt-[18px] rounded-[14px] bg-secondary p-3.5 text-[13px] font-medium leading-[1.45] text-slate-brand">
                Con {MINIMO_DETALLE} mediciones armo el gráfico.
              </div>
            )}

            {rango && escala && (
              <div className="mt-3.5 flex items-start gap-[7px] text-xs font-semibold text-slate-brand">
                <span className="mt-px size-3 shrink-0 rounded-[3px] bg-chip-teal-bg" />
                <span>
                  {rango.texto}. {AVISO_REFERENCIA}
                </span>
              </div>
            )}
          </div>

          {resumen.n > 0 && (
            <div className="grid grid-cols-3 rounded-[20px] bg-card shadow-card">
              {([
                ["Promedio", resumen.promedio],
                ["Mínimo", resumen.minimo],
                ["Máximo", resumen.maximo],
              ] satisfies [string, number | null | undefined][]).map(([label, v], i) => (
                <div key={label} className={cn("px-3 py-3.5", i > 0 && "border-l border-foreground/[0.06]")}>
                  <div className="text-xs font-semibold text-slate-brand">{label}</div>
                  <div className="mt-[3px] text-[19px] font-extrabold tracking-[-0.03em] tabular-nums">
                    {v == null ? "—" : formatearNumero(v, dec)}
                  </div>
                </div>
              ))}
            </div>
          )}
          {resumen.n > 0 && (
            <p className="-mt-2.5 px-1 text-[11.5px] font-medium text-subtle">
              Sobre {resumen.n === 1 ? "la última medición" : `las últimas ${resumen.n} mediciones`}
              {tipo === "presion" ? ", de la presión máxima (sistólica)" : ""}.
            </p>
          )}

          <div className="flex items-start gap-[11px] px-1">
            <div className="min-h-[34px] w-[3px] self-stretch rounded-[3px] bg-primary" />
            <div className="text-[13px] font-medium leading-normal text-slate-brand text-pretty">{resumen.insight}</div>
          </div>

          <div>
            <h2 className="px-0.5 pb-2.5 font-heading text-base font-extrabold tracking-[-0.02em]">Mediciones</h2>
            <ul className="overflow-hidden rounded-[20px] bg-card shadow-card">
              {historial.map((m, i) => {
                const fuera = dentroDeRango(m) === false;
                const detalle = [
                  momentoYHora(m.medido_at),
                  m.contexto ? ETIQUETA_CONTEXTO[m.contexto] : null,
                  m.pulso != null ? `Pulso ${formatearNumero(m.pulso, 0)}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <li
                    key={m.id}
                    className={cn("flex items-center justify-between gap-3 px-4 py-[13px]", i < historial.length - 1 && "border-b border-foreground/[0.06]")}
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-bold">{diaAR(m.medido_at)}</div>
                      <div className="mt-0.5 text-[12.5px] font-medium text-slate-brand">{detalle}</div>
                      {m.notas && <div className="mt-0.5 line-clamp-2 text-xs font-medium text-subtle">{m.notas}</div>}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <div className="flex items-baseline gap-[5px]">
                        <span className={cn("text-base font-extrabold tracking-[-0.02em] tabular-nums", fuera && "text-chip-rose-ink")}>
                          {formatearValor(m)}
                        </span>
                        <span className="text-xs font-semibold text-slate-brand">{meta.unidad}</span>
                      </div>
                      {puedeEditar && (
                        <EliminarMedicionButton medicionId={m.id} descripcion={`${formatearValor(m)} ${meta.unidad}`} />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}

      {puedeEditar && (
        <Link
          href={`/app/mi-salud/monitoreo/agregar?tipo=${tipo}`}
          className="flex items-center justify-center gap-2 rounded-full bg-primary p-4 font-heading text-[14.5px] font-extrabold text-primary-foreground shadow-cta-sm"
        >
          <VitaIcon name="plus" size={16} strokeWidth={2.6} />
          Registrar {meta.nombreMin}
        </Link>
      )}
    </div>
  );
}
