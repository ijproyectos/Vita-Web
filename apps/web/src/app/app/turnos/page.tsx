import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import * as turnosNucleo from "@/lib/turnos/nucleo";
import { etiquetaDia, formatoFechaCorta } from "@/lib/rutina/formato";
import { iconoDeEspecialidad, tonoDeTurno } from "@/lib/turnos/icono";
import type { Turno } from "@/lib/turnos/tipos";
import { VitaIcon } from "@/lib/vita-icons";
import { TopBar } from "../top-bar";

// Mis turnos (Home → "Ver todos"): próximos turnos agrupados por día.
// Solo lectura: editar/eliminar un turno todavía no tiene acción de servidor.
export default async function TurnosPage() {
  const usuario = await requireUser();
  const supabase = await createClient();
  const turnos = await turnosNucleo.listarProximos(supabase, usuario.id, 50);

  const porFecha = new Map<string, Turno[]>();
  for (const t of turnos) {
    if (!porFecha.has(t.fecha)) porFecha.set(t.fecha, []);
    porFecha.get(t.fecha)!.push(t);
  }

  return (
    <div className="flex flex-col gap-5 px-[18px] pb-10 pt-1.5">
      <TopBar eyebrow="Mi salud" title="Mis turnos" />

      {turnos.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-[20px] bg-card px-5 pb-[22px] pt-[26px] text-center shadow-card">
          <div className="flex size-12 items-center justify-center rounded-full bg-persona-1-tint text-persona-1">
            <VitaIcon name="stethoscope" size={22} />
          </div>
          <div className="mt-0.5 font-heading text-[15px] font-extrabold tracking-[-0.02em]">Todavía no hay turnos</div>
          <div className="max-w-[280px] text-[12.5px] font-medium leading-[1.45] text-subtle text-balance">
            Cargá el próximo turno y te aviso con tiempo.
          </div>
        </div>
      )}

      {[...porFecha.entries()].map(([fecha, items]) => (
        <section key={fecha}>
          <h2 className="eyebrow px-0.5 pb-[9px] text-subtle">
            {etiquetaDia(fecha) === "Hoy" || etiquetaDia(fecha) === "Mañana"
              ? `${etiquetaDia(fecha)} · ${formatoFechaCorta(fecha)}`
              : formatoFechaCorta(fecha)}
          </h2>
          <ul className="overflow-hidden rounded-[20px] bg-card shadow-card">
            {items.map((t, i) => (
              <li key={t.id} className={i > 0 ? "border-t border-foreground/[0.06]" : ""}>
                <div className="flex items-center gap-3 py-3.5 pl-4 pr-3.5">
                  <span
                    className="flex size-10 shrink-0 items-center justify-center rounded-[13px] bg-canvas"
                    style={{ color: tonoDeTurno(t.especialidad, i) }}
                  >
                    <VitaIcon name={iconoDeEspecialidad(t.especialidad)} size={19} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-heading text-[14.5px] font-extrabold tracking-[-0.02em]">
                      {t.especialidad}
                    </div>
                    <div className="mt-0.5 truncate text-[11.5px] font-medium text-subtle">
                      {[t.profesional, t.lugar].filter(Boolean).join(" · ") || "Sin profesional cargado"}
                    </div>
                  </div>
                  <div className="text-[13px] font-bold tabular-nums">{t.hora}</div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <Link
        href="/app/agregar-turno"
        className="flex items-center justify-center gap-2 rounded-full bg-primary py-[15px] font-heading text-sm font-extrabold text-primary-foreground shadow-[0_3px_10px_color-mix(in_srgb,var(--primary)_35%,transparent)]"
      >
        <VitaIcon name="plus" size={16} strokeWidth={2.6} />
        Agregar turno
      </Link>
    </div>
  );
}
