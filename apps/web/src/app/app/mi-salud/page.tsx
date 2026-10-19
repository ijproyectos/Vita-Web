import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import * as perfilNucleo from "@/lib/perfil/nucleo";
import * as estudiosNucleo from "@/lib/estudios/nucleo";
import * as inventarioNucleo from "@/lib/inventario/nucleo";
import { VitaIcon } from "@/lib/vita-icons";
import { diaYMes } from "@/lib/rutina/formato";
import { TIPO_PDF } from "@/lib/estudios/tipos";
import { cn } from "@/lib/utils";
import { EliminarEstudioButton } from "./eliminar-estudio-button";

type Filtro = "todo" | "estudios" | "consultas" | "mediciones";

const FILTROS: { id: Filtro; label: string }[] = [
  { id: "todo", label: "Todo" },
  { id: "estudios", label: "Estudios" },
  { id: "consultas", label: "Consultas" },
  { id: "mediciones", label: "Mediciones" },
];

function filtroDe(valor: string | string[] | undefined): Filtro {
  const v = Array.isArray(valor) ? valor[0] : valor;
  return FILTROS.some((f) => f.id === v) ? (v as Filtro) : "todo";
}

export default async function MiSaludPage(props: PageProps<"/app/mi-salud">) {
  const usuario = await requireUser();
  const supabase = await createClient();
  const filtro = filtroDe((await props.searchParams)?.f);
  const [perfil, estudios, inventarios] = await Promise.all([
    perfilNucleo.obtenerPerfil(supabase, usuario.id),
    estudiosNucleo.listar(supabase, usuario.id),
    inventarioNucleo.listarSeguro(supabase, usuario.id),
  ]);
  const pocoStock = inventarioNucleo.filtrarStockBajo(inventarios).length;
  const condiciones = perfil?.condiciones ?? [];
  const alergias = perfil?.alergias ?? [];
  const nombre = perfil?.nombre?.trim() || "Vos";

  return (
    <div className="flex flex-col gap-[22px] px-[18px] pt-1.5">
      <div className="mt-1.5 flex items-start justify-between">
        <div>
          <div className="eyebrow text-primary">Salud de</div>
          <h1 className="mt-[5px] font-heading text-[28px] font-extrabold tracking-[-0.04em] text-teal-deep">{nombre}</h1>
        </div>
        <Link
          href="/app/mi-salud/agregar-estudio"
          aria-label="Agregar un estudio"
          className="flex size-[42px] shrink-0 items-center justify-center rounded-full bg-card text-foreground shadow-card transition-transform active:scale-[0.94] motion-reduce:transition-none"
        >
          <VitaIcon name="plus" size={20} strokeWidth={2} />
        </Link>
      </div>

      {/* Mi estado — colapsable (details nativo: sin JS ni estado de cliente) */}
      <details className="group rounded-[20px] bg-card shadow-card">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-[18px] [&::-webkit-details-marker]:hidden">
          <div>
            <div className="font-heading text-[16.5px] font-extrabold tracking-[-0.02em]">Mi estado</div>
            <div className="mt-0.5 text-[11.5px] font-medium text-subtle">
              {condiciones.length} {condiciones.length === 1 ? "condición" : "condiciones"} · {alergias.length}{" "}
              {alergias.length === 1 ? "alergia" : "alergias"}
            </div>
          </div>
          <VitaIcon
            name="chevron-down"
            size={18}
            className="shrink-0 text-faint transition-transform group-open:rotate-180 motion-reduce:transition-none"
          />
        </summary>
        <div className="mx-[18px] border-t border-dashed pb-[18px] pt-3.5">
          <div className="flex gap-4">
            <div className="eyebrow w-[84px] shrink-0 pt-0.5 text-slate-brand">Diagnóstico</div>
            {condiciones.length > 0 ? (
              <ul className="flex min-w-0 flex-col gap-1.5 text-[14.5px] font-semibold">
                {condiciones.map((c) => (
                  <li key={c.label}>
                    {c.label}
                    {c.tipo === "temporal" && <span className="font-medium text-subtle"> (temporal)</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] font-medium text-subtle">Sin condiciones cargadas.</p>
            )}
          </div>
          <div className="mt-3.5 flex gap-4">
            <div className="eyebrow w-[84px] shrink-0 pt-0.5 text-chip-rose-ink">Alergias</div>
            {alergias.length > 0 ? (
              <ul className="flex min-w-0 flex-col gap-1.5 text-[14.5px] font-bold text-chip-rose-ink">
                {alergias.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] font-medium text-subtle">Sin alergias cargadas.</p>
            )}
          </div>
          <div className="mt-3 flex justify-end">
            <Link href="/app/resumen-salud" className="flex items-center gap-0.5 text-[13px] font-bold text-teal-deep">
              Editar
              <VitaIcon name="chevron-right" size={15} strokeWidth={2.4} />
            </Link>
          </div>
        </div>
      </details>

      {/* Mis pastillas — conteo por foto del blister + control de stock */}
      <Link
        href="/app/pastillas"
        className="flex items-center gap-3 rounded-[20px] bg-card p-[15px] shadow-card transition-transform active:scale-[0.99] motion-reduce:transition-none"
      >
        <div
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-tile)]",
            pocoStock > 0 ? "bg-aviso-tint text-aviso-ink" : "bg-persona-1-tint text-persona-1-deep"
          )}
        >
          <VitaIcon name="pill" size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-heading text-[15px] font-extrabold tracking-[-0.02em]">Mis pastillas</div>
          <div className="mt-0.5 text-[11.5px] font-medium text-subtle">
            {pocoStock > 0
              ? `${pocoStock} ${pocoStock === 1 ? "medicamento con poco stock" : "medicamentos con poco stock"}`
              : "Sacale una foto al blister y llevá la cuenta de lo que queda"}
          </div>
        </div>
        <VitaIcon name="chevron-right" size={18} className="shrink-0 text-faint" />
      </Link>

      {/* Monitoreo activo — sin datos reales todavía (fase de mediciones):
          no se fabrican números. */}
      <section>
        <h2 className="px-0.5 pb-[9px] font-heading text-[17px] font-extrabold tracking-[-0.03em]">Monitoreo activo</h2>
        <div className="rounded-[20px] bg-card p-[18px] shadow-card">
          <div className="flex items-center justify-between gap-2">
            <div className="eyebrow text-persona-1">Presión · Glucemia · Peso</div>
            <span className="rounded-full bg-secondary px-2.5 py-1 text-[10.5px] font-bold text-slate-brand">
              Próximamente
            </span>
          </div>
          <p className="mt-2.5 text-[13px] font-medium leading-[1.45] text-subtle">
            Vas a poder registrar tus mediciones y ver cómo evolucionan acá, sin salir de vita.
          </p>
        </div>
      </section>

      {/* Registros — Estudios es real; Consultas y Mediciones llegan en otra fase */}
      <section>
        <h2 className="px-0.5 pb-[11px] font-heading text-[17px] font-extrabold tracking-[-0.03em]">Registros</h2>
        <nav aria-label="Filtrar registros" className="-mx-[18px] mb-3.5 flex gap-2 overflow-x-auto px-[18px] pb-1">
          {FILTROS.map((f) => (
            <Link
              key={f.id}
              href={f.id === "todo" ? "/app/mi-salud" : `/app/mi-salud?f=${f.id}`}
              scroll={false}
              aria-current={filtro === f.id ? "page" : undefined}
              className={cn(
                "shrink-0 rounded-full px-4 py-2.5 text-[13px] font-bold transition-colors motion-reduce:transition-none",
                filtro === f.id ? "bg-ink text-cream" : "bg-card text-slate-brand shadow-item"
              )}
            >
              {f.label}
            </Link>
          ))}
        </nav>

        {(filtro === "todo" || filtro === "estudios") &&
          (estudios.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-[20px] bg-card px-5 pb-[22px] pt-[26px] text-center shadow-card">
              <div className="flex size-12 items-center justify-center rounded-full bg-persona-1-tint text-persona-1">
                <VitaIcon name="vial" size={22} />
              </div>
              <div className="mt-0.5 font-heading text-[15px] font-extrabold tracking-[-0.02em]">Todavía no hay estudios</div>
              <div className="max-w-[290px] text-[12.5px] font-medium leading-[1.45] text-subtle text-balance">
                Sacale una foto o subí el PDF de un estudio y vita completa los datos por vos.
              </div>
              <Link
                href="/app/mi-salud/agregar-estudio"
                className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 font-heading text-[13px] font-extrabold text-primary-foreground"
              >
                <VitaIcon name="plus" size={14} strokeWidth={2.4} /> Agregar estudio
              </Link>
            </div>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {estudios.map((e) => {
                const esPdf = e.archivo_tipo === TIPO_PDF;
                const { dia, mes } = diaYMes(e.fecha ?? e.created_at.slice(0, 10));
                return (
                  <li key={e.id} className="flex items-start gap-1 rounded-[20px] bg-card p-3.5 shadow-card">
                    <Link href={`/app/mi-salud/estudios/${e.id}`} className="flex min-w-0 flex-1 gap-3">
                      {!esPdf && e.urlFirmada ? (
                        // eslint-disable-next-line @next/next/no-img-element -- URL firmada temporal de Storage privado, no un asset de Next
                        <img src={e.urlFirmada} alt="" className="size-[46px] shrink-0 rounded-[var(--radius-tile)] object-cover" />
                      ) : (
                        <div className="flex size-[46px] shrink-0 items-center justify-center rounded-[var(--radius-tile)] bg-persona-1-tint text-persona-1-deep">
                          <VitaIcon name={esPdf ? "doc" : "vial"} size={20} />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <div className="truncate font-heading text-[15px] font-extrabold tracking-[-0.02em]">
                            {e.tipo ?? "Estudio sin identificar"}
                          </div>
                          <div className="shrink-0 text-[11.5px] font-semibold text-subtle">
                            {dia} {mes.toLowerCase()}
                            {!e.fecha && " · cargado"}
                          </div>
                        </div>
                        {e.resumen && <div className="mt-0.5 line-clamp-2 text-[12.5px] font-medium text-subtle">{e.resumen}</div>}
                        {e.estado === "error" && (
                          <div className="mt-1 text-[11px] font-semibold text-teal-deep">
                            vita no pudo leer los datos — el archivo quedó guardado igual.
                          </div>
                        )}
                        {e.valores.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {e.valores.slice(0, 4).map((v) => (
                              <span key={v.nombre} className="rounded-full bg-secondary px-2 py-0.5 text-[10.5px] font-semibold text-slate-brand">
                                {v.nombre}: {v.valor}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-bold text-slate-brand">
                          <VitaIcon name="paperclip" size={11} /> {esPdf ? "PDF" : "Foto"}
                        </div>
                      </div>
                    </Link>
                    <EliminarEstudioButton estudioId={e.id} nombre={e.tipo ?? "este estudio"} />
                  </li>
                );
              })}
            </ul>
          ))}

        {filtro === "consultas" && (
          <EstadoVacio
            icono="stethoscope"
            titulo="Consultas — próximamente"
            texto="Acá vas a ver el historial de tus consultas con cada profesional."
          />
        )}
        {filtro === "mediciones" && (
          <EstadoVacio
            icono="activity"
            titulo="Mediciones — próximamente"
            texto="Acá vas a ver tus mediciones de presión, glucemia y peso."
          />
        )}
        {filtro === "todo" && estudios.length > 0 && (
          <p className="px-1 pt-3 text-center text-[11.5px] font-medium text-subtle">
            Las consultas y las mediciones se van a sumar a esta lista.
          </p>
        )}
      </section>
    </div>
  );
}

function EstadoVacio({ icono, titulo, texto }: { icono: string; titulo: string; texto: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-[20px] bg-card px-5 pb-[22px] pt-[26px] text-center shadow-card">
      <div className="flex size-12 items-center justify-center rounded-full bg-persona-1-tint text-persona-1">
        <VitaIcon name={icono} size={22} />
      </div>
      <div className="mt-0.5 font-heading text-[15px] font-extrabold tracking-[-0.02em]">{titulo}</div>
      <div className="max-w-[280px] text-[12.5px] font-medium leading-[1.45] text-subtle text-balance">{texto}</div>
    </div>
  );
}
