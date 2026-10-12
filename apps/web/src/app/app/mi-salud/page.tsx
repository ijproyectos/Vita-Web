import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import * as perfilNucleo from "@/lib/perfil/nucleo";
import * as estudiosNucleo from "@/lib/estudios/nucleo";
import * as inventarioNucleo from "@/lib/inventario/nucleo";
import { VitaIcon } from "@/lib/vita-icons";
import { Chip } from "@/components/vita/chip";
import { colorChipPorIndice } from "@/lib/perfil/tipos";
import { formatoFechaCorta } from "@/lib/rutina/formato";
import { TIPO_PDF } from "@/lib/estudios/tipos";
import { EliminarEstudioButton } from "./eliminar-estudio-button";

export default async function MiSaludPage() {
  const usuario = await requireUser();
  const supabase = await createClient();
  const [perfil, estudios, inventarios] = await Promise.all([
    perfilNucleo.obtenerPerfil(supabase, usuario.id),
    estudiosNucleo.listar(supabase, usuario.id),
    inventarioNucleo.listarSeguro(supabase, usuario.id),
  ]);
  const pocoStock = inventarioNucleo.filtrarStockBajo(inventarios).length;
  const condiciones = perfil?.condiciones ?? [];
  const alergias = perfil?.alergias ?? [];

  return (
    <div className="flex flex-col gap-5 px-4 pt-2">
      <div className="mt-1.5 flex items-center justify-between">
        <div>
          <div className="text-[12px] font-semibold uppercase tracking-wide text-primary">Historial</div>
          <div className="mt-0.5 font-heading text-[26px] font-extrabold tracking-tight">Mi Salud</div>
        </div>
        <Link
          href="/app/resumen-salud"
          aria-label="Editar perfil de salud"
          className="flex size-10 items-center justify-center rounded-full bg-card shadow-card"
        >
          <VitaIcon name="edit" size={18} />
        </Link>
      </div>

      {/* Mi estado */}
      <div className="rounded-[20px] bg-card p-4.5 shadow-card">
        <div className="font-heading text-[15px] font-bold">Mi estado</div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {condiciones.length} condiciones · {alergias.length} alergias
        </div>

        {condiciones.length > 0 && (
          <>
            <div className="mb-2 mt-3.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Condiciones</div>
            <div className="flex flex-wrap gap-2">
              {condiciones.map((c, i) => (
                <Chip key={c.label} color={colorChipPorIndice(i)}>
                  {c.label}
                </Chip>
              ))}
            </div>
          </>
        )}

        <div className="mb-2 mt-3.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Alergias</div>
        {alergias.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {alergias.map((a) => (
              <Chip key={a} color="rose">
                {a}
              </Chip>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Sin alergias cargadas.</p>
        )}

        <Link href="/app/resumen-salud" className="mt-3.5 inline-block text-sm font-semibold text-primary">
          Editar en Resumen de salud →
        </Link>
      </div>

      {/* Mis pastillas — conteo por foto del blister + control de stock */}
      <Link href="/app/pastillas" className="flex items-center gap-3 rounded-[20px] bg-card p-4 shadow-card">
        <div
          className={`flex size-11 shrink-0 items-center justify-center rounded-2xl ${
            pocoStock > 0 ? "bg-chip-amber-bg text-chip-amber-ink" : "bg-chip-teal-bg text-chip-teal-ink"
          }`}
        >
          <VitaIcon name="pill" size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-heading text-[15px] font-bold">Mis pastillas</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {pocoStock > 0
              ? `${pocoStock} ${pocoStock === 1 ? "medicamento con poco stock" : "medicamentos con poco stock"}`
              : "Sacale una foto al blister y llevá la cuenta de lo que queda"}
          </div>
        </div>
        <VitaIcon name="chevron-right" size={16} className="text-muted-foreground" />
      </Link>

      {/* Monitoreo activo — sin datos reales todavía, no se fabrican números */}
      <SeccionProximamente
        titulo="Monitoreo activo"
        descripcion="Presión, glucemia y peso — próximamente vas a poder registrarlos acá y ver su evolución."
      />

      {/* Estudios — real: foto o PDF + extracción automática por IA
          (agregar-estudio/). Vacunas/consultas/mediciones siguen sin
          pantalla de alta en ningún lado del diseño, no se fabrican acá. */}
      <div>
        <div className="flex items-center justify-between px-0.5 pb-2.5">
          <div className="font-heading text-[15px] font-bold">Estudios</div>
          <Link href="/app/mi-salud/agregar-estudio" className="flex items-center gap-1 text-sm font-semibold text-primary">
            <VitaIcon name="plus" size={14} /> Agregar
          </Link>
        </div>

        {estudios.length === 0 ? (
          <div className="rounded-[20px] bg-secondary p-5 text-center">
            <p className="text-sm text-muted-foreground">
              Sacale una foto o subí el PDF de un estudio (análisis, radiografía, informe) y vita completa los datos por vos. Acá queda el registro de todo lo que te vas haciendo.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {estudios.map((e) => {
              const esPdf = e.archivo_tipo === TIPO_PDF;
              return (
                <div key={e.id} className="flex items-start gap-2 rounded-[20px] bg-card p-3 shadow-card">
                  <Link href={`/app/mi-salud/estudios/${e.id}`} className="flex min-w-0 flex-1 gap-3">
                    {!esPdf && e.urlFirmada ? (
                      // eslint-disable-next-line @next/next/no-img-element -- URL firmada temporal de Storage privado, no un asset de Next
                      <img src={e.urlFirmada} alt="" className="size-14 shrink-0 rounded-[14px] object-cover" />
                    ) : (
                      <div className="flex size-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-[14px] bg-chip-teal-bg text-chip-teal-ink">
                        <VitaIcon name={esPdf ? "doc" : "camera"} size={20} />
                        {esPdf && <span className="text-[9px] font-extrabold tracking-wide">PDF</span>}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-heading text-[14.5px] font-bold">
                        {e.tipo ?? "Estudio sin identificar"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatoFechaCorta(e.fecha ?? e.created_at.slice(0, 10))}
                        {!e.fecha && " (cargado)"}
                      </div>
                      {e.resumen && <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{e.resumen}</div>}
                      {e.estado === "error" && (
                        <div className="mt-1 text-[11px] font-semibold text-primary">
                          vita no pudo leer los datos — el archivo quedó guardado igual.
                        </div>
                      )}
                      {e.valores.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {e.valores.slice(0, 4).map((v) => (
                            <span key={v.nombre} className="rounded-full bg-secondary px-2 py-0.5 text-[10.5px] font-semibold text-muted-foreground">
                              {v.nombre}: {v.valor}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </Link>
                  <EliminarEstudioButton estudioId={e.id} nombre={e.tipo ?? "este estudio"} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function SeccionProximamente({ titulo, descripcion }: { titulo: string; descripcion: string }) {
  return (
    <div>
      <div className="px-0.5 pb-2.5 font-heading text-[15px] font-bold">{titulo}</div>
      <div className="rounded-[20px] bg-secondary p-5 text-center">
        <p className="text-sm text-muted-foreground">{descripcion}</p>
      </div>
    </div>
  );
}
