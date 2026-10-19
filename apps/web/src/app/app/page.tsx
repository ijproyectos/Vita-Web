import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import * as medicamentos from "@/lib/medicamentos/nucleo";
import * as turnosNucleo from "@/lib/turnos/nucleo";
import * as perfilNucleo from "@/lib/perfil/nucleo";
import * as inventarioNucleo from "@/lib/inventario/nucleo";
import { AvisoStockBajo } from "@/components/vita/aviso-stock-bajo";
import { AvisoRecordatorio } from "@/components/vita/aviso-recordatorio";
import { InstalarVita } from "@/components/vita/instalar-vita";
import { NudgeVita } from "@/components/vita/nudge-vita";
import { listarRecordatoriosPendientes } from "@/lib/notificaciones/recordatorios";
import { fechaDeHoyISO, formatoFechaCorta, saludoEnAR } from "@/lib/rutina/formato";
import { VitaIcon } from "@/lib/vita-icons";
import { TurnoCard, AgregarTurnoCard } from "./rutina/turno-card";

export default async function HomePage() {
  const usuario = await requireUser();
  const supabase = await createClient();

  const [perfil, medsHoy, adherencia, turnosProximos, inventarios] = await Promise.all([
    perfilNucleo.obtenerPerfil(supabase, usuario.id),
    medicamentos.listarHoy(supabase, usuario.id),
    medicamentos.calcularAdherencia(supabase, usuario.id),
    turnosNucleo.listarProximos(supabase, usuario.id, 5),
    inventarioNucleo.listarSeguro(supabase, usuario.id),
  ]);

  const recordatorios = await listarRecordatoriosPendientes(supabase, usuario.id, medsHoy);
  const stockBajo = inventarioNucleo.filtrarStockBajo(inventarios);

  const nombre = perfil?.nombre?.split(" ")[0] ?? "Ahí vamos";
  const hayAvisos = recordatorios.length > 0 || stockBajo.length > 0;

  // Adherencia de hoy: un segmento por toma, en orden horario. "Sigue" es la
  // primera toma sin marcar.
  const tomas = [...medsHoy].sort((a, b) => a.hora_programada.localeCompare(b.hora_programada));
  const tomados = tomas.filter((m) => m.tomado).length;
  const siguiente = tomas.find((m) => !m.tomado);
  const textoSigue =
    tomas.length === 0
      ? "No tenés medicamentos programados para hoy."
      : siguiente
        ? `Sigue: ${siguiente.nombre} a las ${siguiente.hora_programada.slice(0, 5)}`
        : "Listo por hoy. No queda nada pendiente.";

  return (
    <div className="flex flex-col gap-[22px] px-[18px] pt-1.5">
      <InstalarVita />

      {/* Saludo + selector de perfil (hoy solo vos) + avisos */}
      <div className="mt-1.5 flex items-start justify-between">
        <div>
          <div className="eyebrow text-subtle">{saludoEnAR()},</div>
          <div className="mt-[5px] flex items-center gap-[9px]">
            <h1 className="font-heading text-[28px] font-extrabold tracking-[-0.04em] text-teal-deep">{nombre}</h1>
            {/* TODO(fase familia): acá va el selector de perfiles. Hoy es solo
                la persona actual, así que el chevron es decorativo. */}
            <span
              aria-hidden
              className="flex size-[26px] shrink-0 items-center justify-center rounded-full bg-persona-1-tint text-persona-1"
            >
              <VitaIcon name="chevron-down" size={14} strokeWidth={2.8} />
            </span>
          </div>
        </div>
        <Link
          href="/app/avisos"
          aria-label={hayAvisos ? "Avisos, hay novedades" : "Avisos"}
          className="relative flex size-[42px] shrink-0 items-center justify-center rounded-full bg-card text-slate-brand shadow-card transition-transform active:scale-[0.94] motion-reduce:transition-none"
        >
          <VitaIcon name="bell" size={19} strokeWidth={1.9} />
          {hayAvisos && <span className="absolute right-[11px] top-2.5 size-2 rounded-full bg-primary ring-2 ring-card" />}
        </Link>
      </div>

      <AvisoRecordatorio items={recordatorios} href="/app/modo-simple" />

      {/* Tarjeta de perfil */}
      <Link href="/app/resumen-salud" className="flex items-center justify-between rounded-[20px] bg-card p-[18px] shadow-card">
        <div className="flex items-center gap-3">
          <div className="flex size-[52px] shrink-0 items-center justify-center rounded-full bg-persona-1-tint font-heading text-xl font-extrabold text-persona-1-deep">
            {(perfil?.nombre ?? "?").charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="truncate font-heading text-[16.5px] font-extrabold tracking-[-0.02em]">
              {perfil?.nombre ?? "Tu perfil"}
            </div>
            <div className="mt-0.5 text-[11.5px] font-medium text-subtle">Resumen de salud</div>
          </div>
        </div>
        <VitaIcon name="chevron-right" size={18} className="shrink-0 text-faint" />
      </Link>

      {/* Adherencia de hoy */}
      <Link
        href="/app/rutina"
        className="rounded-[20px] bg-teal-deep px-[18px] pb-4 pt-[18px] text-primary-foreground transition-transform active:scale-[0.99] motion-reduce:transition-none"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="text-[13px] font-semibold">Hoy, {formatoFechaCorta(fechaDeHoyISO())}</div>
          <div className="flex items-center gap-0.5 text-[13px] font-bold">
            Rutina
            <VitaIcon name="chevron-right" size={15} strokeWidth={2.4} />
          </div>
        </div>
        <div className="mt-2 font-heading text-2xl font-extrabold leading-[1.15] tracking-[-0.025em]">
          {tomados} de {tomas.length} tomados
        </div>
        {tomas.length > 0 && (
          <div className="mt-3.5 flex gap-1" aria-hidden>
            {tomas.map((m) => (
              <div key={m.id} className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div
                  className={
                    "h-1.5 rounded-[3px] " +
                    (m.tomado ? "bg-primary-foreground" : "bg-primary-foreground/25")
                  }
                />
                <div
                  className={
                    "text-[11px] font-bold tabular-nums " +
                    (m.tomado ? "text-primary-foreground" : "text-primary-foreground/60")
                  }
                >
                  {m.hora_programada.slice(0, 5)}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-3 border-t border-primary-foreground/[0.18] pt-3 text-[13.5px] font-semibold leading-[1.4]">
          {textoSigue}
        </div>
        {adherencia.rachaDias > 0 && (
          <div className="mt-1.5 flex items-center gap-1 text-[12px] font-medium text-primary-foreground/80">
            <VitaIcon name="flame" size={12} /> Llevás {adherencia.rachaDias}{" "}
            {adherencia.rachaDias === 1 ? "día" : "días"} sin saltarte ninguno
          </div>
        )}
      </Link>

      <AvisoStockBajo items={stockBajo} href="/app/pastillas" />

      {/* Próximos turnos */}
      <div>
        <div className="flex items-baseline justify-between px-0.5 pb-[11px]">
          <h2 className="font-heading text-base font-extrabold tracking-[-0.02em]">Próximos turnos</h2>
          <Link href="/app/turnos" className="text-[13px] font-bold text-teal-deep">
            Ver todos →
          </Link>
        </div>
        <div className="-mx-[18px] flex gap-2.5 overflow-x-auto px-[18px] pb-1 [scrollbar-width:none]">
          {turnosProximos.map((t, i) => (
            <TurnoCard key={t.id} turno={t} indice={i} />
          ))}
          <AgregarTurnoCard />
        </div>
      </div>

      <NudgeVita />
    </div>
  );
}
