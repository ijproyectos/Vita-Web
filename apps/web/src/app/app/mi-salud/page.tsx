import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import * as perfilNucleo from "@/lib/perfil/nucleo";
import * as estudiosNucleo from "@/lib/estudios/nucleo";
import * as inventarioNucleo from "@/lib/inventario/nucleo";
import * as medicionesNucleo from "@/lib/mediciones/nucleo";
import { agruparPorTipo, resumirTipo } from "@/lib/mediciones/resumen";
import { TIPOS_MEDICION } from "@/lib/mediciones/tipos";
import { VitaIcon } from "@/lib/vita-icons";
import * as registrosNucleo from "@/lib/registros/nucleo";
import { armarFeed } from "@/lib/registros/feed";
import type { CategoriaRegistro } from "@/lib/registros/tipos";
import { cn } from "@/lib/utils";
import { obtenerOpcionesPerfil, obtenerPerfilActivo } from "@/lib/familia/perfil-activo";
import { EncabezadoPerfil } from "@/components/vita/encabezado-perfil";
import { EstadoVacioMonitoreo, TarjetaMini } from "./monitoreo/componentes";
import { BotonAgregarSalud } from "./boton-agregar-salud";

type Filtro = "todo" | CategoriaRegistro;

const FILTROS: { id: Filtro; label: string }[] = [
  { id: "todo", label: "Todo" },
  { id: "estudio", label: "Estudios" },
  { id: "vacuna", label: "Vacunas" },
  { id: "consulta", label: "Consultas" },
  { id: "medicion", label: "Mediciones" },
];

// Mismo mapa de categorías del diseño (catMeta, D:4867).
const CAT_META: Record<CategoriaRegistro, { icono: string; clases: string }> = {
  estudio: { icono: "vial", clases: "bg-chip-teal-bg text-chip-teal-ink" },
  medicion: { icono: "chart", clases: "bg-chip-violet-bg text-chip-violet-ink" },
  consulta: { icono: "stethoscope", clases: "bg-chip-amber-bg text-chip-amber-ink" },
  vacuna: { icono: "syringe", clases: "bg-chip-rose-bg text-chip-rose-ink" },
};

function filtroDe(valor: string | string[] | undefined): Filtro {
  const v = Array.isArray(valor) ? valor[0] : valor;
  return FILTROS.some((f) => f.id === v) ? (v as Filtro) : "todo";
}

export default async function MiSaludPage(props: PageProps<"/app/mi-salud">) {
  await requireUser();
  const supabase = await createClient();
  const filtro = filtroDe((await props.searchParams)?.f);
  // Familia: Mi Salud muestra la salud del perfil activo.
  const [activo, opciones] = await Promise.all([obtenerPerfilActivo(), obtenerOpcionesPerfil()]);
  const puedeEditar = activo.rol === "editar";
  const [perfil, estudios, inventarios, mediciones, consultas, vacunas] = await Promise.all([
    perfilNucleo.obtenerPerfil(supabase, activo.id),
    estudiosNucleo.listar(supabase, activo.id),
    inventarioNucleo.listarSeguro(supabase, activo.id),
    medicionesNucleo.listarRecientesSeguro(supabase, activo.id),
    registrosNucleo.listarConsultasSeguro(supabase, activo.id),
    registrosNucleo.listarVacunasSeguro(supabase, activo.id),
  ]);
  const feed = armarFeed({ estudios, mediciones, consultas, vacunas });
  // El diseño oculta "Vacunas" por defecto: el chip aparece solo si hay alguna cargada.
  const filtros = FILTROS.filter((f) => f.id !== "vacuna" || vacunas.length > 0);
  const visibles = filtro === "todo" ? feed : feed.filter((r) => r.cat === filtro);
  const medicionesPorTipo = agruparPorTipo(mediciones);
  const resumenes = TIPOS_MEDICION.filter((t) => medicionesPorTipo.has(t)).map((t) =>
    resumirTipo(t, medicionesPorTipo.get(t)!)
  );
  const pocoStock = inventarioNucleo.filtrarStockBajo(inventarios).length;
  const condiciones = perfil?.condiciones ?? [];
  const alergias = perfil?.alergias ?? [];
  const nombre = perfil?.nombre?.trim() || activo.nombre;

  return (
    <div className="flex flex-col gap-[22px] px-[18px] pt-1.5">
      <EncabezadoPerfil
        perfil={activo}
        opciones={opciones}
        nombre={nombre.split(" ")[0]}
        eyebrowSelector="Salud de"
        estatico={{ eyebrow: "Tu salud", titulo: "Mi Salud" }}
        pie={!puedeEditar ? <div className="mt-1 text-[12px] font-semibold text-subtle">Solo ver: no podés cambiar nada.</div> : undefined}
        accion={puedeEditar ? <BotonAgregarSalud nombrePersona={activo.esPropio ? null : nombre.split(" ")[0]} /> : undefined}
      />

      {/* Mi estado — colapsable (details nativo: sin JS ni estado de cliente) */}
      <details className="group rounded-[20px] bg-card shadow-card">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-[18px] [&::-webkit-details-marker]:hidden">
          <div>
            <div className="font-heading text-[16.5px] font-extrabold tracking-[-0.02em]">
              {activo.esPropio ? "Mi estado" : "Su estado"}
            </div>
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
            <Link href="/app/condiciones" className="flex items-center gap-0.5 text-[13px] font-bold text-teal-deep">
              {puedeEditar ? "Editar" : "Ver todo"}
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
          <div className="font-heading text-[15px] font-extrabold tracking-[-0.02em]">
            {activo.esPropio ? "Mis pastillas" : "Sus pastillas"}
          </div>
          <div className="mt-0.5 text-[11.5px] font-medium text-subtle">
            {pocoStock > 0
              ? `${pocoStock} ${pocoStock === 1 ? "medicamento con poco stock" : "medicamentos con poco stock"}`
              : "Sacale una foto al blister y llevá la cuenta de lo que queda"}
          </div>
        </div>
        <VitaIcon name="chevron-right" size={18} className="shrink-0 text-faint" />
      </Link>

      {/* Monitoreo activo — mediciones reales (presión, glucemia, peso…) */}
      <section>
        <div className="flex items-baseline justify-between px-0.5 pb-[9px]">
          <Link
            href="/app/mi-salud/monitoreo"
            className="flex items-center gap-1 font-heading text-[17px] font-extrabold tracking-[-0.03em]"
          >
            Monitoreo activo
            <VitaIcon name="chevron-right" size={16} strokeWidth={2.4} className="text-faint" />
          </Link>
          <Link href="/app/mi-salud/monitoreo" className="text-[13px] font-bold text-teal-deep">
            Ver todo
          </Link>
        </div>
        {resumenes.length === 0 ? (
          <EstadoVacioMonitoreo puedeEditar={puedeEditar} volver="/app/mi-salud" />
        ) : (
          <div className="-mx-[18px] flex gap-2.5 overflow-x-auto px-[18px] pb-1">
            {resumenes.map((r) => (
              <TarjetaMini key={r.tipo} resumen={r} />
            ))}
          </div>
        )}
      </section>

      {/* Registros — feed cronológico de estudios, mediciones, consultas y vacunas */}
      <section>
        <h2 className="px-0.5 pb-[11px] font-heading text-base font-extrabold tracking-[-0.3px]">Registros</h2>
        <nav aria-label="Filtrar registros" className="-mx-[18px] mb-[13px] flex gap-2 overflow-x-auto px-[18px] pb-1 [scrollbar-width:none]">
          {filtros.map((f) => (
            <Link
              key={f.id}
              href={f.id === "todo" ? "/app/mi-salud" : `/app/mi-salud?f=${f.id}`}
              scroll={false}
              aria-current={filtro === f.id ? "page" : undefined}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-full px-3.5 py-2 text-[12.5px] font-bold transition-colors motion-reduce:transition-none",
                filtro === f.id ? "bg-ink text-cream" : "bg-card text-slate-brand shadow-item"
              )}
            >
              {f.label}
            </Link>
          ))}
        </nav>

        {visibles.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-[20px] bg-card px-5 pb-[22px] pt-[26px] text-center shadow-card">
            <div className="flex size-12 items-center justify-center rounded-full bg-persona-1-tint text-persona-1">
              <VitaIcon name="vial" size={22} />
            </div>
            <div className="mt-0.5 font-heading text-[15px] font-extrabold tracking-[-0.02em]">
              {filtro === "estudio"
                ? "Todavía no hay estudios"
                : filtro === "consulta"
                  ? "Todavía no hay consultas"
                  : filtro === "vacuna"
                    ? "Todavía no hay vacunas"
                    : filtro === "medicion"
                      ? "Todavía no hay mediciones"
                      : "Todavía no hay nada acá"}
            </div>
            <div className="max-w-[280px] text-[12.5px] font-medium leading-[1.45] text-subtle text-balance">
              {filtro === "estudio"
                ? "Sacale una foto al resultado o subí el PDF. Lo guardo y te cuento qué dice."
                : filtro === "consulta"
                  ? "Las consultas médicas que registres van a quedar acá, en orden por fecha."
                  : filtro === "vacuna"
                    ? "Las vacunas que registres van a quedar acá, en orden por fecha."
                    : filtro === "medicion"
                      ? "Las mediciones de presión, glucemia o peso que cargues van a quedar acá."
                      : "Los estudios, consultas y mediciones que cargues van a quedar en orden por fecha."}
            </div>
            {puedeEditar && (filtro === "todo" || filtro === "estudio") && (
              <Link
                href="/app/mi-salud/agregar-estudio"
                className="mt-2 inline-flex rounded-full bg-primary px-5 py-[11px] font-heading text-[13.5px] font-extrabold text-primary-foreground shadow-cta-sm"
              >
                Agregar estudio
              </Link>
            )}
          </div>
        ) : (
          <ul className="flex flex-col gap-[9px]">
            {visibles.map((r) => {
              const meta = CAT_META[r.cat];
              const contenido = (
                <>
                  <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-[13px]", meta.clases)}>
                    <VitaIcon name={meta.icono} size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="truncate font-heading text-[14.5px] font-extrabold tracking-[-0.25px]">{r.titulo}</div>
                      <div className="shrink-0 text-[11px] font-semibold tabular-nums text-subtle">{r.cuando}</div>
                    </div>
                    <div className="mt-[3px] text-[11.5px] font-medium text-subtle">{r.sub}</div>
                    <div className="mt-[9px] flex flex-wrap items-center gap-[7px]">
                      {r.adjunto && (
                        <div className="inline-flex items-center gap-1.5 rounded-full bg-canvas px-2.5 py-1 text-[11px] font-bold text-slate-brand">
                          <VitaIcon name="paperclip" size={11} strokeWidth={2.2} />
                          {r.adjunto}
                        </div>
                      )}
                      <div className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-faint">· {r.origen === "vita" ? "vita" : "manual"}</div>
                    </div>
                  </div>
                </>
              );
              return (
                <li key={r.clave}>
                  {r.href ? (
                    <Link href={r.href} className="flex items-start gap-3 rounded-[16px] bg-card p-3.5 shadow-item">
                      {contenido}
                    </Link>
                  ) : (
                    <div className="flex items-start gap-3 rounded-[16px] bg-card p-3.5 shadow-item">{contenido}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
