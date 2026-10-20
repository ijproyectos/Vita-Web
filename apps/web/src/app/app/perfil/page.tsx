import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import * as perfilNucleo from "@/lib/perfil/nucleo";
import * as medicamentos from "@/lib/medicamentos/nucleo";
import { edadTexto } from "@/lib/perfil/formato";
import { VitaWordmark } from "@/components/vita/v-mark";
import { obtenerUsoHoy } from "@/lib/uso-ia/nucleo";
import { BarraUso, textoRestante } from "@/components/uso-ia/barra-uso";
import { esEmailDeCuentaPorCodigo } from "@/lib/acceso-codigo/tipos";
import { ActivarNotificaciones } from "@/components/vita/activar-notificaciones";
import { EliminarCuenta } from "./eliminar-cuenta";
import { FilaAccion, FilaInfo, FilaNav, Grupo } from "./filas";

export default async function PerfilPage() {
  const usuario = await requireUser();
  const supabase = await createClient();

  const [perfil, adherencia, uso, todos] = await Promise.all([
    perfilNucleo.obtenerPerfil(supabase, usuario.id),
    medicamentos.calcularAdherencia(supabase, usuario.id),
    obtenerUsoHoy(usuario.id),
    medicamentos.listarTodos(supabase, usuario.id).catch(() => []),
  ]);

  // new Date() en vez de Date.now() — el lint de pureza de Server
  // Components tolera el primero, no el segundo (ver nota en CLAUDE.md).
  const aniosConVita = perfil?.created_at
    ? Math.max(0, (new Date().getTime() - new Date(perfil.created_at).getTime()) / (365.25 * 24 * 3600 * 1000))
    : 0;

  const nombre = perfil?.nombre?.trim() || "Tu cuenta";
  const condiciones = perfil?.condiciones.length ?? 0;
  const alergias = perfil?.alergias.length ?? 0;
  // Una fila por horario: se cuenta por nombre para no duplicar un mismo
  // medicamento tomado varias veces al día.
  const medsActivos = new Set(todos.map((m) => m.nombre.trim().toLowerCase())).size;
  const meta = perfil
    ? [edadTexto(perfil), perfil.grupo_sanguineo && `Grupo ${perfil.grupo_sanguineo}`, perfil.obra_social].filter(Boolean).join(" · ")
    : "";
  const emergencia = perfil?.contacto_emergencia_nombre?.trim();

  return (
    <div className="flex flex-col gap-[22px] px-[18px] pt-1.5">
      <div className="mt-1.5">
        <div className="eyebrow text-primary">Perfil de</div>
        <h1 className="mt-[5px] font-heading text-[28px] font-extrabold tracking-[-0.04em] text-teal-deep">{nombre}</h1>
      </div>

      {/* Tarjeta de perfil */}
      <div className="rounded-[20px] bg-card p-[18px] shadow-card">
        <div className="flex items-center gap-3.5">
          <div className="flex size-[68px] shrink-0 items-center justify-center rounded-full bg-persona-1-tint font-heading text-[26px] font-extrabold text-persona-1-deep">
            {nombre.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-heading text-[17.5px] font-extrabold tracking-[-0.02em]">{perfil?.nombre ?? "Tu cuenta"}</div>
            <div className="mt-0.5 text-[11.5px] font-medium leading-snug text-subtle">
              {meta || (esEmailDeCuentaPorCodigo(usuario.email) ? "Cuenta vinculada con tu familiar" : usuario.email)}
            </div>
          </div>
          <Link
            href="/app/resumen-salud"
            className="shrink-0 rounded-full bg-persona-1-tint px-4 py-2.5 text-[13px] font-bold text-persona-1-deep"
          >
            Editar
          </Link>
        </div>
        {meta && (
          <div className="mt-2.5 truncate text-[11.5px] font-medium text-subtle">
            {esEmailDeCuentaPorCodigo(usuario.email) ? "Cuenta vinculada con tu familiar" : usuario.email}
          </div>
        )}
        <div className="mt-4 grid grid-cols-2 border-t border-foreground/[0.06] pt-3.5">
          <Stat label="Racha" valor={`${adherencia.rachaDias} d`} />
          <Stat label="Años con vita" valor={aniosConVita < 0.1 ? "<1" : aniosConVita.toFixed(1)} divisor />
        </div>
      </div>

      {uso && (
        <Grupo titulo="Uso de vita hoy">
          <div className="flex flex-col gap-2 px-4 py-4">
            <BarraUso uso={uso} />
            <div className="text-[13px] font-bold">{textoRestante(uso)}</div>
            <div className="text-[11.5px] font-medium text-subtle">
              {uso.usados.toLocaleString("es-AR")} de {uso.limite.toLocaleString("es-AR")} tokens usados hoy
            </div>
          </div>
        </Grupo>
      )}

      <Grupo titulo="Mi salud">
        <FilaNav
          icon="heart"
          tono="rose"
          label="Condiciones y alergias"
          sub={`${condiciones} ${condiciones === 1 ? "condición" : "condiciones"} · ${alergias} ${alergias === 1 ? "alergia" : "alergias"}`}
          href="/app/mi-salud"
        />
        <FilaNav
          icon="pill"
          tono="teal"
          label="Mis medicamentos"
          sub={`${medsActivos} ${medsActivos === 1 ? "activo" : "activos"}`}
          href="/app/pastillas"
        />
        <FilaInfo icon="activity" tono="violet" label="Monitoreo" sub="Presión, glucemia, peso" etiqueta="Próximamente" />
        <FilaNav icon="vial" tono="amber" label="Estudios" sub="Fotos y PDFs con lectura automática" href="/app/mi-salud?f=estudios" />
      </Grupo>

      <Grupo titulo="Preferencias">
        <FilaNav
          icon="users"
          tono="violet"
          label="Familia"
          sub="Perfiles a cargo, quién te cuida y sus permisos"
          href="/app/familia"
        />
        <FilaNav
          icon="users"
          label="Mis cuidadores"
          sub="Invitá a alguien para que vea tu adherencia"
          href="/app/perfil/cuidadores"
        />
        <FilaNav
          icon="link"
          label="Vincular a alguien"
          sub="Ayudá a un familiar a cargar su celular con un código"
          href="/onboarding/vincular-cuidado"
        />
        <FilaNav
          icon="sun"
          label="Modo simple"
          sub="Pantalla grande para confirmar tu medicación, sin menús"
          href="/app/modo-simple"
        />
        <ActivarNotificaciones variante="perfil" />
        <FilaNav
          icon="bell"
          label="Recordatorios"
          sub="Qué avisos recibir, esperas y silencio de noche"
          href="/app/avisos/configuracion"
        />
        <FilaNav
          icon="user"
          label="Contacto de emergencia"
          sub={emergencia ? `${emergencia} — recibe el botón Ayuda del modo simple` : "Sin cargar"}
          href="/app/resumen-salud"
        />
        <FilaNav icon="shield" label="Seguridad" sub="Tu sesión en este dispositivo" href="/app/perfil/seguridad" />
        <FilaNav icon="lock" label="Privacidad y datos" sub="Exportar, compartir o borrar tu historial" href="/app/perfil/privacidad" />
      </Grupo>

      <Grupo titulo="Cuenta">
        <FilaNav icon="help" label="Ayuda y soporte" sub="Preguntas frecuentes y contacto" href="/app/perfil/ayuda" />
        <form action="/auth/signout" method="post">
          <FilaAccion icon="logout" label="Cerrar sesión" sub={esEmailDeCuentaPorCodigo(usuario.email) ? "Volvés a entrar con el código de tu familiar" : "Volvés a entrar con Google"} />
        </form>
        <EliminarCuenta />
      </Grupo>

      <div className="flex flex-col items-center gap-2 pb-2 pt-2 text-center">
        <VitaWordmark size={26} />
        <div className="text-[11px] font-medium text-subtle">versión 1.0</div>
      </div>
    </div>
  );
}

function Stat({ label, valor, divisor }: { label: string; valor: string; divisor?: boolean }) {
  return (
    <div className={divisor ? "border-l border-foreground/[0.06] text-center" : "text-center"}>
      <div className="font-heading text-[20px] font-extrabold tracking-[-0.03em]">{valor}</div>
      <div className="eyebrow mt-0.5 text-subtle">{label}</div>
    </div>
  );
}
