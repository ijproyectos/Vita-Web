import { notFound } from "next/navigation";
import Link from "next/link";
import { requireCuidador } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import * as medicamentos from "@/lib/medicamentos/nucleo";
import { VitaIcon } from "@/lib/vita-icons";
import { cn } from "@/lib/utils";
import type { MedicamentoConToma } from "@/lib/medicamentos/tipos";

// Mismo margen de gracia que `notificaciones/nucleo.ts` (GRACIA_MIN_DEFAULT)
// — acá es solo el umbral visual del badge "Atrasada", no dispara ningún
// envío; se repite el literal en vez de importar una constante privada
// del otro módulo.
const GRACIA_MIN = 30;

// Dashboard de solo lectura del elder seleccionado. Reutiliza sin cambios
// `listarHoy`/`calcularAdherencia` de lib/medicamentos/nucleo.ts pasando
// el `elderId` en vez del id del propio cuidador — funciona gracias a las
// policies aditivas de 008_cuidadores.sql (`medicamentos_select_cuidador`,
// `medicamentos_tomas_select_cuidador`), no porque este archivo reimplemente
// la lectura. No hay ningún botón/form/toggle que escriba: ni
// marcarTomadoAction ni ninguna otra Server Action se importa acá.
export default async function CuidarElderPage(props: PageProps<"/cuidar/[elderId]">) {
  const { elderId } = await props.params;
  const { elders } = await requireCuidador();

  const elder = elders.find((e) => e.elderId === elderId);
  if (!elder) {
    notFound();
  }

  const supabase = await createClient();
  const [medsHoy, adherencia] = await Promise.all([
    medicamentos.listarHoy(supabase, elderId),
    medicamentos.calcularAdherencia(supabase, elderId),
  ]);

  const ahoraAR = medicamentos.horaEnAR();

  return (
    <div className="flex flex-col gap-5 px-4 pt-4">
      <div className="flex items-center gap-3">
        <Link
          href="/cuidar"
          aria-label="Volver"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-card shadow-[var(--shadow-card,0_8px_24px_rgba(15,33,54,0.06))]"
        >
          <VitaIcon name="chevron-left" size={18} />
        </Link>
        <div>
          <div className="text-[12px] font-semibold uppercase tracking-wide text-primary">Modo cuidador</div>
          <div className="mt-0.5 font-heading text-[20px] font-extrabold tracking-tight">{elder.nombre}</div>
        </div>
      </div>

      <div
        className="rounded-[20px] p-5 text-white shadow-[0_14px_36px_rgba(8,145,178,0.28)]"
        style={{ background: "linear-gradient(135deg, #0891b2 0%, #0e7490 100%)" }}
      >
        <div className="grid grid-cols-2">
          <div className="text-center">
            <div className="font-heading text-[26px] font-extrabold tracking-tight">{adherencia.porcentaje}%</div>
            <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wide opacity-85">Adherencia 7 días</div>
          </div>
          <div className="border-l border-white/20 text-center">
            <div className="font-heading text-[26px] font-extrabold tracking-tight">{adherencia.rachaDias}d</div>
            <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wide opacity-85">Racha actual</div>
          </div>
        </div>
      </div>

      <div>
        <div className="px-1.5 pb-2.5 font-heading text-[15px] font-bold">Medicamentos de hoy</div>
        {medsHoy.length === 0 ? (
          <div className="rounded-[20px] bg-card p-5 text-center text-sm text-muted-foreground shadow-[var(--shadow-card,0_8px_24px_rgba(15,33,54,0.06))]">
            No tiene medicamentos programados para hoy.
          </div>
        ) : (
          <div className="rounded-[20px] bg-card shadow-[var(--shadow-card,0_8px_24px_rgba(15,33,54,0.06))]">
            {medsHoy.map((med, i) => (
              <FilaMedicamentoSoloLectura
                key={med.id}
                med={med}
                divider={i < medsHoy.length - 1}
                ahoraAR={ahoraAR}
              />
            ))}
          </div>
        )}
      </div>

      {adherencia.medicamentos.length > 0 && (
        <div>
          <div className="px-1.5 pb-2.5 font-heading text-[15px] font-bold">Adherencia por medicamento</div>
          <div className="rounded-[20px] bg-card shadow-[var(--shadow-card,0_8px_24px_rgba(15,33,54,0.06))]">
            {adherencia.medicamentos.map((m, i) => (
              <div
                key={m.medicamentoId}
                className={cn("flex items-center gap-3 px-4.5 py-3.5", i < adherencia.medicamentos.length - 1 && "border-b")}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{m.nombre}</div>
                  <div className="mt-0.5 text-[11.5px] text-muted-foreground">
                    {m.tomados}/{m.esperados} tomas en 7 días
                  </div>
                </div>
                <span className="shrink-0 font-heading text-sm font-bold text-primary">{m.porcentaje}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="px-1.5 text-center text-[11px] text-muted-foreground">
        Vista de solo lectura — como cuidador no podés editar ni marcar tomas.
      </p>
    </div>
  );
}

function FilaMedicamentoSoloLectura({
  med,
  divider,
  ahoraAR,
}: {
  med: MedicamentoConToma;
  divider: boolean;
  ahoraAR: string;
}) {
  const atrasada = !med.tomado && medicamentosEsDosisVencida(med.hora_programada, ahoraAR);

  return (
    <div className={cn("flex items-center gap-3 px-4.5 py-3.5", divider && "border-b")}>
      <div
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-full",
          med.tomado ? "bg-chip-teal-bg text-chip-teal-ink" : atrasada ? "bg-chip-rose-bg text-chip-rose-ink" : "bg-chip-amber-bg text-chip-amber-ink"
        )}
      >
        <VitaIcon name="pill" size={19} />
      </div>
      <div className="min-w-0 flex-1">
        <div className={cn("truncate font-heading text-[14.5px] font-bold", med.tomado && "opacity-55 line-through")}>
          {med.nombre}
        </div>
        <div className="text-xs text-muted-foreground">
          {med.dosis ? `${med.dosis} · ` : ""}
          {med.hora_programada} hs
        </div>
      </div>
      <span
        className={cn(
          "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold",
          med.tomado ? "bg-chip-teal-bg text-chip-teal-ink" : atrasada ? "bg-chip-rose-bg text-chip-rose-ink" : "bg-chip-amber-bg text-chip-amber-ink"
        )}
      >
        {med.tomado ? "Tomada" : atrasada ? "Atrasada" : "Pendiente"}
      </span>
    </div>
  );
}

// Reexportado localmente con nombre distinto para dejar clarísimo en el
// JSX de arriba que esto es un cálculo de presentación, nunca una
// escritura — `esDosisVencida` en sí es la misma función pura de
// lib/medicamentos/nucleo.ts, no una reimplementación.
function medicamentosEsDosisVencida(horaProgramada: string, ahoraAR: string): boolean {
  return medicamentos.esDosisVencida(horaProgramada, ahoraAR, GRACIA_MIN);
}
