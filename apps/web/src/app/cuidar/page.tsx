import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import * as cuidadoresNucleo from "@/lib/cuidadores/nucleo";
import { VitaIcon } from "@/lib/vita-icons";
import { VitaWordmark } from "@/components/vita/v-mark";
import { cn } from "@/lib/utils";

// Selector de elder — si el cuidador solo tiene un vínculo aceptado, lo
// muestra igual como una única tarjeta (en vez de saltar directo a
// `/cuidar/[elderId]`) para que la navegación sea siempre predecible.
//
// A propósito NO usa `requireCuidador()` (que redirige a
// /cuidar/sin-vinculos apenas `elders.length === 0`) — desde que existe la
// dirección (b), un cuidador recién llegado puede tener un código
// pendiente y CERO elders aceptados todavía; con `requireCuidador()` nunca
// llegaría a ver esa sección de "Códigos pendientes" de acá abajo. Gatea
// acá mismo, con el criterio ampliado (elders O pendientes).
export default async function CuidarPage() {
  const usuario = await requireUser();
  const supabase = await createClient();

  const [elders, iniciados] = await Promise.all([
    cuidadoresNucleo.listarElders(supabase, usuario.id),
    cuidadoresNucleo.listarVinculosIniciadosPorMi(supabase, usuario.id),
  ]);
  // Vínculos que este cuidador inició por código (dirección b) — incluye
  // los todavía pendientes (código sin reclamar, con countdown) además de
  // los ya aceptados, que ya están cubiertos arriba por `elders` (RPC
  // `listar_elders_vinculados`, dirección-agnóstica una vez aceptado).
  const pendientes = iniciados.filter((v) => v.estado === "pendiente" && v.codigo);

  if (elders.length === 0 && pendientes.length === 0) {
    redirect("/cuidar/sin-vinculos");
  }

  return (
    <div className="flex flex-col gap-5 px-4 pt-6">
      <div className="flex flex-col items-center gap-2 pb-2 text-center">
        <VitaWordmark size={22} />
        <div className="font-heading text-[13px] font-semibold uppercase tracking-wide text-primary">
          Modo cuidador
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between px-1.5 pb-2.5">
          <div className="font-heading text-[15px] font-bold">A quién cuidás</div>
          <Link href="/onboarding/vincular-cuidado" className="text-xs font-semibold text-primary">
            + Vincular a alguien
          </Link>
        </div>
        <div className="flex flex-col gap-2.5">
          {elders.map((elder) => (
            <Link
              key={elder.elderId}
              href={`/cuidar/${elder.elderId}`}
              className="flex items-center gap-3 rounded-[20px] bg-card p-4 shadow-[var(--shadow-card,0_8px_24px_rgba(15,33,54,0.06))]"
            >
              <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary font-heading text-base font-extrabold text-primary">
                {elder.nombre.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-heading text-[15px] font-bold">{elder.nombre}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">Ver adherencia de hoy</div>
              </div>
              <VitaIcon name="chevron-right" size={16} className="text-muted-foreground" />
            </Link>
          ))}
        </div>
      </div>

      {pendientes.length > 0 && (
        <div>
          <div className="px-1.5 pb-2.5 font-heading text-[15px] font-bold">Códigos pendientes</div>
          <div className="rounded-[20px] bg-card shadow-[var(--shadow-card,0_8px_24px_rgba(15,33,54,0.06))]">
            {pendientes.map((v, i) => (
              <FilaCodigoPendiente key={v.id} vinculo={v} divider={i < pendientes.length - 1} />
            ))}
          </div>
        </div>
      )}

      <form action="/auth/signout" method="post" className="flex justify-center py-4">
        <button type="submit" className="text-sm font-semibold text-destructive">
          Cerrar sesión
        </button>
      </form>
    </div>
  );
}

function FilaCodigoPendiente({
  vinculo,
  divider,
}: {
  vinculo: { id: string; codigo: string | null; expira_at: string };
  divider: boolean;
}) {
  const minutosRestantes = Math.max(0, Math.round((new Date(vinculo.expira_at).getTime() - new Date().getTime()) / 60000));
  const vencido = minutosRestantes === 0;

  return (
    <div className={cn("flex items-center gap-3 px-4.5 py-3.5", divider && "border-b")}>
      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-chip-amber-bg text-chip-amber-ink">
        <VitaIcon name="clock" size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-heading text-[14.5px] font-bold tracking-wide">{vinculo.codigo}</div>
        <div className="mt-0.5 text-[11.5px] text-muted-foreground">
          {vencido ? "Expirado" : `Vence en ${minutosRestantes} min`}
        </div>
      </div>
      <span className="shrink-0 rounded-full bg-chip-amber-bg px-2.5 py-1 text-[11px] font-bold text-chip-amber-ink">
        Pendiente
      </span>
    </div>
  );
}
