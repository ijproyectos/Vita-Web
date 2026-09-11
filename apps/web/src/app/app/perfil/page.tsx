import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import * as perfilNucleo from "@/lib/perfil/nucleo";
import * as medicamentos from "@/lib/medicamentos/nucleo";
import { VitaIcon } from "@/lib/vita-icons";
import { VitaWordmark } from "@/components/vita/v-mark";
import { ToggleRow } from "./toggle-row";

export default async function PerfilPage() {
  const usuario = await requireUser();
  const supabase = await createClient();

  const [perfil, adherencia] = await Promise.all([
    perfilNucleo.obtenerPerfil(supabase, usuario.id),
    medicamentos.calcularAdherencia(supabase, usuario.id),
  ]);

  // new Date() en vez de Date.now() — el lint de pureza de Server
  // Components tolera el primero, no el segundo (ver nota en CLAUDE.md).
  const aniosConVita = perfil?.created_at
    ? Math.max(0, (new Date().getTime() - new Date(perfil.created_at).getTime()) / (365.25 * 24 * 3600 * 1000))
    : 0;

  return (
    <div className="flex flex-col gap-5 px-4 pt-2">
      <div className="mt-1.5 flex items-center justify-between">
        <div>
          <div className="text-[12px] font-semibold uppercase tracking-wide text-primary">Cuenta</div>
          <div className="mt-0.5 font-heading text-[26px] font-extrabold tracking-tight">Perfil</div>
        </div>
      </div>

      {/* Hero */}
      <div
        className="relative overflow-hidden rounded-[20px] p-5 text-white shadow-[0_14px_36px_rgba(8,145,178,0.28)]"
        style={{ background: "linear-gradient(135deg, #0891b2 0%, #0e7490 100%)" }}
      >
        <div className="flex items-center gap-3">
          <div className="flex size-16 items-center justify-center rounded-full bg-white/20 font-heading text-2xl font-extrabold backdrop-blur">
            {(perfil?.nombre ?? "?").charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-heading text-[20px] font-extrabold leading-tight">{perfil?.nombre ?? "Tu cuenta"}</div>
            <div className="mt-0.5 truncate text-[13px] opacity-88">{usuario.email}</div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3">
          <MiniStat label="Estudios" valor="0" />
          <MiniStat label="Años con vita" valor={aniosConVita < 0.1 ? "<1" : aniosConVita.toFixed(1)} divisor />
          <MiniStat label="Racha" valor={`${adherencia.rachaDias}d`} divisor />
        </div>
      </div>

      {/* Conexiones — decorativo, sin integraciones reales conectadas */}
      <Grupo titulo="Conexiones" subtitulo="Integraciones para traer data automáticamente">
        <ConexionRow icon="gmail" color="#EA4335" titulo="Gmail" sub="Detecto estudios automáticamente" />
        <ConexionRow icon="heart-plus" color="#FF3B30" titulo="Apple Health" sub="Métricas desde tu iPhone/Watch" />
        <ConexionRow icon="activity" color="#4285F4" titulo="Google Fit" sub="Métricas desde Wear OS / Android" ultimo />
      </Grupo>

      {/* Notificaciones — decorativo, sin infraestructura de push conectada */}
      <Grupo titulo="Notificaciones">
        <ToggleRow label="Recordatorios de rutina" sub="Medicamentos y monitoreo" defaultOn />
        <ToggleRow label="Próximos turnos" sub="24 h antes" defaultOn />
        <ToggleRow label="vita te escribe" sub="Si olvidás marcar una toma" defaultOn />
        <ToggleRow label="Estudios detectados en Gmail" sub="Confirmación antes de guardar" ultimo />
      </Grupo>

      {/* Privacidad y datos — decorativo */}
      <Grupo titulo="Privacidad y datos">
        <LinkRow icon="doc" label="Exportar mi historial" sub="PDF con todo tu timeline" />
        <LinkRow icon="upload" label="Compartir con profesional" sub="Link temporal con tu médico" />
        <LinkRow icon="settings" label="Privacidad" sub="Qué usa vita de tu data" ultimo />
      </Grupo>

      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <VitaWordmark size={26} />
        <div className="text-[11px] text-muted-foreground">versión 1.0</div>
        <form action="/auth/signout" method="post">
          <button type="submit" className="text-sm font-semibold text-destructive">
            Cerrar sesión
          </button>
        </form>
      </div>
    </div>
  );
}

function MiniStat({ label, valor, divisor }: { label: string; valor: string; divisor?: boolean }) {
  return (
    <div className={`text-center px-2 py-1 ${divisor ? "border-l border-white/20" : ""}`}>
      <div className="font-heading text-[20px] font-extrabold tracking-tight">{valor}</div>
      <div className="mt-0.5 text-[10.5px] font-medium uppercase tracking-wide opacity-85">{label}</div>
    </div>
  );
}

function Grupo({ titulo, subtitulo, children }: { titulo: string; subtitulo?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="px-1.5 pb-2.5">
        <div className="font-heading text-[15px] font-bold">{titulo}</div>
        {subtitulo && <div className="mt-0.5 text-xs text-muted-foreground">{subtitulo}</div>}
      </div>
      <div className="rounded-[20px] bg-card shadow-[var(--shadow-card,0_8px_24px_rgba(15,33,54,0.06))]">{children}</div>
    </div>
  );
}

function ConexionRow({
  icon,
  color,
  titulo,
  sub,
  ultimo,
}: {
  icon: string;
  color: string;
  titulo: string;
  sub: string;
  ultimo?: boolean;
}) {
  return (
    <div className={`flex items-center gap-3 px-4.5 py-3.5 ${ultimo ? "" : "border-b"}`}>
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl" style={{ background: `${color}15`, color }}>
        <VitaIcon name={icon} size={20} color={color} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-heading text-[14.5px] font-bold">{titulo}</div>
        <div className="truncate text-xs text-muted-foreground">{sub}</div>
      </div>
      <button type="button" className="rounded-full bg-secondary px-3.5 py-1.5 text-xs font-bold text-primary">
        Conectar
      </button>
    </div>
  );
}

function LinkRow({ icon, label, sub, ultimo }: { icon: string; label: string; sub: string; ultimo?: boolean }) {
  return (
    <div className={`flex items-center gap-3 px-4.5 py-3.5 ${ultimo ? "" : "border-b"}`}>
      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
        <VitaIcon name={icon} size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">{label}</div>
        <div className="mt-0.5 text-[11.5px] text-muted-foreground">{sub}</div>
      </div>
      <VitaIcon name="chevron-right" size={16} className="text-muted-foreground" />
    </div>
  );
}
