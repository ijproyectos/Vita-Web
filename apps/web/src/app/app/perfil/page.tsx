import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import * as perfilNucleo from "@/lib/perfil/nucleo";
import * as medicamentos from "@/lib/medicamentos/nucleo";
import { VitaIcon } from "@/lib/vita-icons";
import { VitaWordmark } from "@/components/vita/v-mark";
import { obtenerUsoHoy } from "@/lib/uso-ia/nucleo";
import { BarraUso, textoRestante } from "@/components/uso-ia/barra-uso";
import { esEmailDeCuentaPorCodigo } from "@/lib/acceso-codigo/tipos";
import { ToggleRow } from "./toggle-row";
import { EliminarCuenta } from "./eliminar-cuenta";
import { ActivarNotificaciones } from "@/components/vita/activar-notificaciones";

export default async function PerfilPage() {
  const usuario = await requireUser();
  const supabase = await createClient();

  const [perfil, adherencia, uso] = await Promise.all([
    perfilNucleo.obtenerPerfil(supabase, usuario.id),
    medicamentos.calcularAdherencia(supabase, usuario.id),
    obtenerUsoHoy(usuario.id),
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
        className="relative overflow-hidden rounded-[20px] p-5 text-primary-foreground shadow-[0_14px_36px_color-mix(in_srgb,var(--primary)_28%,transparent)]"
        style={{ background: "linear-gradient(135deg, var(--brand-from) 0%, var(--brand-to) 100%)" }}
      >
        <div className="flex items-center gap-3">
          <div className="flex size-16 items-center justify-center rounded-full bg-primary-foreground/20 font-heading text-2xl font-extrabold backdrop-blur">
            {(perfil?.nombre ?? "?").charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-heading text-[20px] font-extrabold leading-tight">{perfil?.nombre ?? "Tu cuenta"}</div>
            <div className="mt-0.5 truncate text-[13px] opacity-88">{esEmailDeCuentaPorCodigo(usuario.email) ? "Cuenta vinculada con tu familiar" : usuario.email}</div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3">
          <MiniStat label="Estudios" valor="0" />
          <MiniStat label="Años con vita" valor={aniosConVita < 0.1 ? "<1" : aniosConVita.toFixed(1)} divisor />
          <MiniStat label="Racha" valor={`${adherencia.rachaDias}d`} divisor />
        </div>
      </div>

      {uso && (
        <Grupo titulo="Uso de vita hoy">
          <div className="flex flex-col gap-2 px-4.5 py-4">
            <BarraUso uso={uso} />
            <div className="text-[13px] font-semibold">{textoRestante(uso)}</div>
            <div className="text-[11.5px] text-muted-foreground">
              {uso.usados.toLocaleString("es-AR")} de {uso.limite.toLocaleString("es-AR")} tokens usados hoy
            </div>
          </div>
        </Grupo>
      )}

      {/* Cuidado compartido — real, a diferencia de los grupos decorativos de abajo */}
      <Grupo titulo="Cuidado compartido">
        <NavLinkRow icon="users" label="Mis cuidadores" sub="Invitá a alguien para que vea tu adherencia" href="/app/perfil/cuidadores" />
        <NavLinkRow
          icon="link"
          label="Vincular a alguien"
          sub="Ayudá a un familiar a cargar su celular con un código"
          href="/onboarding/vincular-cuidado"
        />
        <NavLinkRow
          icon="bell"
          label="Modo simple"
          sub="Pantalla grande para confirmar tu medicación, sin menús"
          ultimo
          href="/app/modo-simple"
        />
      </Grupo>

      {/* Notificaciones — la primera fila (avisos push en este celular) es
          real; los tres toggles de abajo siguen siendo decorativos. */}
      <Grupo titulo="Notificaciones">
        <ActivarNotificaciones variante="perfil" />
        <ToggleRow label="Recordatorios de rutina" sub="Medicamentos y monitoreo" defaultOn />
        <ToggleRow label="Próximos turnos" sub="24 h antes" defaultOn />
        <ToggleRow label="vita te escribe" sub="Si olvidás marcar una toma" defaultOn ultimo />
      </Grupo>

      {/* Privacidad y datos — todo real */}
      <Grupo titulo="Privacidad y datos">
        <NavLinkRow icon="doc" label="Exportar mi historial" sub="PDF o JSON con todos tus datos" href="/app/perfil/historial" />
        <NavLinkRow
          icon="upload"
          label="Compartir con profesional"
          sub="Link temporal con tu médico"
          href="/app/perfil/compartir"
        />
        <NavLinkRow icon="settings" label="Privacidad" sub="Qué usa vita de tu data" href="/legal/privacidad" />
        <NavLinkRow icon="doc" label="Términos y condiciones" sub="Las reglas de uso de vita" href="/legal/terminos" />
        <EliminarCuenta />
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
    <div className={`text-center px-2 py-1 ${divisor ? "border-l border-primary-foreground/20" : ""}`}>
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
      <div className="rounded-[20px] bg-card shadow-card">{children}</div>
    </div>
  );
}

// Fila de grupo que navega a una pantalla real.
function NavLinkRow({
  icon,
  label,
  sub,
  ultimo,
  href,
}: {
  icon: string;
  label: string;
  sub: string;
  ultimo?: boolean;
  href: string;
}) {
  return (
    <Link href={href} className={`flex items-center gap-3 px-4.5 py-3.5 ${ultimo ? "" : "border-b"}`}>
      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
        <VitaIcon name={icon} size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">{label}</div>
        <div className="mt-0.5 text-[11.5px] text-muted-foreground">{sub}</div>
      </div>
      <VitaIcon name="chevron-right" size={16} className="text-muted-foreground" />
    </Link>
  );
}
