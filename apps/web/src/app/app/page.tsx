import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import * as medicamentos from "@/lib/medicamentos/nucleo";
import * as turnosNucleo from "@/lib/turnos/nucleo";
import * as perfilNucleo from "@/lib/perfil/nucleo";
import * as inventarioNucleo from "@/lib/inventario/nucleo";
import type { ResumenStock } from "@/lib/inventario/tipos";
import { AvisoStockBajo } from "@/components/vita/aviso-stock-bajo";
import { AvisoRecordatorio } from "@/components/vita/aviso-recordatorio";
import { listarRecordatoriosPendientes } from "@/lib/notificaciones/recordatorios";
import { colorChipPorIndice } from "@/lib/perfil/tipos";
import { VitaIcon } from "@/lib/vita-icons";
import { Chip } from "@/components/vita/chip";
import { ProgressRing } from "@/components/vita/progress-ring";
import { MedRow } from "./rutina/med-row";
import { TurnoCard, AgregarTurnoCard } from "./rutina/turno-card";
import { HeroVita } from "./hero-vita";

function saludo(): string {
  const h = new Date().getHours();
  if (h < 12) return "Buen día";
  if (h < 19) return "Hola";
  return "Buenas noches";
}

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

  const stockPorId = new Map<string, ResumenStock>(
    inventarios.map((i) => [i.id, { stock: i.stock, umbral: i.umbral_alerta }])
  );
  const stockBajo = inventarioNucleo.filtrarStockBajo(inventarios);

  const nombre = perfil?.nombre?.split(" ")[0] ?? "Ahí vamos";
  const tomados = medsHoy.filter((m) => m.tomado).length;
  const total = medsHoy.length;
  const pct = total === 0 ? 0 : Math.round((tomados / total) * 100);

  const condiciones = perfil?.condiciones ?? [];
  const alergias = perfil?.alergias ?? [];

  return (
    <div className="flex flex-col gap-5 px-4 pt-2">
      {/* Top bar */}
      <div className="mt-1.5 flex items-center justify-between">
        <div>
          <div className="text-[13px] font-medium text-muted-foreground">{saludo()},</div>
          <div className="mt-0.5 font-heading text-[26px] font-extrabold tracking-tight">
            {nombre} <span className="font-normal">👋</span>
          </div>
        </div>
        <div className="relative flex size-10 items-center justify-center rounded-full bg-card shadow-card">
          <VitaIcon name="bell" size={20} />
          <span className="absolute right-2.5 top-2.5 size-2 rounded-full bg-primary ring-2 ring-card" />
        </div>
      </div>

      <HeroVita />

      <AvisoRecordatorio items={recordatorios} href="/app/modo-simple" />

      {/* Profile summary card */}
      <Link href="/app/resumen-salud" className="rounded-[20px] bg-card p-4 shadow-card">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-[54px] items-center justify-center rounded-full bg-gradient-to-br from-chip-teal-bg to-chip-teal-bg font-heading text-xl font-bold text-chip-teal-ink">
              {(perfil?.nombre ?? "?").charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="font-heading text-[17px] font-bold">{perfil?.nombre ?? "Tu perfil"}</div>
              <div className="text-xs text-muted-foreground">Resumen de salud</div>
            </div>
          </div>
          <VitaIcon name="chevron-right" size={18} className="text-muted-foreground" />
        </div>

        <div className="mt-3.5 grid grid-cols-3 rounded-[20px] bg-secondary px-1 py-3">
          <Estadistica etiqueta="Altura" valor={perfil?.altura_cm != null ? `${perfil.altura_cm}` : "—"} unidad="cm" />
          <Estadistica etiqueta="Peso" valor={perfil?.peso_kg != null ? `${perfil.peso_kg}` : "—"} unidad="kg" divisor />
          <Estadistica etiqueta="Grupo" valor={perfil?.grupo_sanguineo ?? "—"} unidad="" divisor />
        </div>

        {(condiciones.length > 0 || alergias.length > 0) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {condiciones.map((c, i) => (
              <Chip key={c.label} color={colorChipPorIndice(i)}>
                {c.label}
              </Chip>
            ))}
            {alergias.map((a) => (
              <Chip key={a} color="rose">
                {a}
              </Chip>
            ))}
          </div>
        )}
      </Link>

      <AvisoStockBajo items={stockBajo} href="/app/pastillas" />

      {/* Today progress card */}
      <Link
        href="/app/rutina"
        className="relative overflow-hidden rounded-[20px] p-4.5 text-primary-foreground shadow-[0_14px_36px_color-mix(in_srgb,var(--primary)_28%,transparent)]"
        style={{ background: "linear-gradient(135deg, var(--brand-from) 0%, var(--brand-to) 100%)" }}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[12.5px] font-semibold uppercase tracking-wide opacity-80">Hoy</div>
            <div className="mt-1 font-heading text-[22px] font-extrabold leading-tight">
              {tomados} de {total} medicamentos
            </div>
            {adherencia.rachaDias > 0 && (
              <div className="mt-1 flex items-center gap-1 text-[13px] opacity-85">
                <VitaIcon name="flame" size={13} /> Llevás {adherencia.rachaDias}{" "}
                {adherencia.rachaDias === 1 ? "día" : "días"} sin saltarte ninguno
              </div>
            )}
          </div>
          <ProgressRing pct={pct} />
        </div>
      </Link>

      {/* Próximos turnos */}
      <div>
        <div className="flex items-center justify-between px-0.5 pb-2.5">
          <div className="font-heading text-[15px] font-bold">Próximos turnos</div>
          <Link href="/app/rutina" className="text-sm font-semibold text-primary">
            Ver todos →
          </Link>
        </div>
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
          {turnosProximos.map((t, i) => (
            <TurnoCard key={t.id} turno={t} indice={i} />
          ))}
          <AgregarTurnoCard />
        </div>
      </div>

      {/* Medicamentos de hoy */}
      <div>
        <div className="flex items-center justify-between px-0.5 pb-2.5">
          <div className="font-heading text-[15px] font-bold">Medicamentos de hoy</div>
          <Link href="/app/rutina" className="text-sm font-semibold text-primary">
            Ver rutina →
          </Link>
        </div>
        {medsHoy.length === 0 ? (
          <div className="rounded-[20px] bg-card p-4 text-sm text-muted-foreground shadow-card">
            No tenés medicamentos programados para hoy.
          </div>
        ) : (
          <div className="rounded-[20px] bg-card p-1.5 shadow-card">
            {medsHoy.map((m, i) => (
              <MedRow
                key={m.id}
                med={m}
                color={colorChipPorIndice(i)}
                divider={i < medsHoy.length - 1}
                stock={m.inventario_id ? (stockPorId.get(m.inventario_id) ?? null) : null}
              />
            ))}
          </div>
        )}
      </div>

    </div>
  );
}

function Estadistica({
  etiqueta,
  valor,
  unidad,
  divisor,
}: {
  etiqueta: string;
  valor: string;
  unidad: string;
  divisor?: boolean;
}) {
  return (
    <div className={`px-3 py-1.5 text-center ${divisor ? "border-l border-foreground/[0.06]" : ""}`}>
      <div className="font-heading text-[20px] font-extrabold tracking-tight">
        {valor}
        {unidad && <span className="ml-0.5 text-xs font-semibold text-muted-foreground">{unidad}</span>}
      </div>
      <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{etiqueta}</div>
    </div>
  );
}
