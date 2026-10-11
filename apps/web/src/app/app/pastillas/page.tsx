import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import * as inventarioNucleo from "@/lib/inventario/nucleo";
import { esStockBajo, textoQuedan } from "@/lib/inventario/tipos";
import { VitaIcon } from "@/lib/vita-icons";
import { cn } from "@/lib/utils";
import { TopBar } from "../top-bar";

export default async function PastillasPage() {
  const usuario = await requireUser();
  const supabase = await createClient();
  const grupos = await inventarioNucleo.listarGrupos(supabase, usuario.id);

  return (
    <div className="flex flex-col gap-4.5 px-4 pt-2">
      <TopBar eyebrow="Mi Salud" title="Mis pastillas" />

      <p className="px-0.5 text-sm text-muted-foreground">
        Sacale una foto al blister, vita cuenta las pastillas y después va descontando cada toma que marques. Si quedan
        pocas, te avisamos.
      </p>

      {grupos.length === 0 ? (
        <div className="rounded-[20px] bg-secondary p-5 text-center">
          <p className="text-sm text-muted-foreground">Todavía no cargaste medicamentos.</p>
          <Link href="/app/agregar-medicamento" className="mt-2 inline-block text-sm font-semibold text-primary">
            Agregar un medicamento →
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {grupos.map((g) => {
            const inv = g.inventario;
            const bajo = inv ? esStockBajo(inv.stock, inv.umbral_alerta) : false;
            const dias = inventarioNucleo.diasQueAlcanza(g);

            return (
              <div key={g.clave} className="rounded-[20px] bg-card p-4 shadow-card">
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "flex size-10 shrink-0 items-center justify-center rounded-full",
                      bajo ? "bg-chip-amber-bg text-chip-amber-ink" : "bg-chip-teal-bg text-chip-teal-ink"
                    )}
                  >
                    <VitaIcon name="pill" size={19} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-heading text-[15px] font-bold">{g.nombre}</div>
                    <div className="text-xs text-muted-foreground">
                      {[g.dosis, `${g.medicamentoIds.length} ${g.medicamentoIds.length === 1 ? "toma" : "tomas"} por día`]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                  {inv && (
                    <div className="shrink-0 text-right">
                      <div
                        className={cn(
                          "font-heading text-[26px] font-extrabold leading-none tracking-tight",
                          bajo && "text-chip-amber-ink"
                        )}
                      >
                        {inv.stock}
                      </div>
                      <div className="mt-0.5 text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">
                        pastillas
                      </div>
                    </div>
                  )}
                </div>

                {inv ? (
                  <>
                    {bajo && (
                      <div className="mt-3 flex items-center gap-2 rounded-[14px] bg-chip-amber-bg px-3 py-2 text-[13px] font-semibold text-chip-amber-ink">
                        <VitaIcon name="alert-triangle" size={15} className="shrink-0" />
                        {textoQuedan(inv.stock)} — conviene reponer
                      </div>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[11.5px] text-muted-foreground">
                      <span className="rounded-full bg-secondary px-2.5 py-1 font-semibold">
                        {inv.pastillas_por_toma} por toma
                      </span>
                      {dias !== null && (
                        <span className="rounded-full bg-secondary px-2.5 py-1 font-semibold">
                          {dias === 0 ? "Alcanza para menos de un día" : `Te alcanza para ~${dias} ${dias === 1 ? "día" : "días"}`}
                        </span>
                      )}
                      <Link
                        href={`/app/pastillas/contar?medicamento=${g.representanteId}`}
                        className="ml-auto text-sm font-semibold text-primary"
                      >
                        Volver a contar
                      </Link>
                    </div>
                  </>
                ) : (
                  <Link
                    href={`/app/pastillas/contar?medicamento=${g.representanteId}`}
                    className="mt-3 flex items-center justify-center gap-2 rounded-full bg-secondary py-2.5 font-heading text-[13.5px] font-bold text-primary"
                  >
                    <VitaIcon name="camera" size={16} /> Contar pastillas
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
