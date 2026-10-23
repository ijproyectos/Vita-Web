import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import * as perfilNucleo from "@/lib/perfil/nucleo";
import { esEmailDeCuentaPorCodigo } from "@/lib/acceso-codigo/tipos";
import { TopBar } from "../../top-bar";
import { FilaAccion, Grupo, Tile } from "../filas";
import { PinSeguridad } from "./pin-seguridad";

// Seguridad (V7): PIN al volver (real, de este dispositivo), verificación en
// dos pasos (todavía no existe: se dice "Próximamente", sin interruptor
// falso), datos reales de la sesión y cierre de sesión.
export default async function SeguridadPage() {
  const usuario = await requireUser();
  const supabase = await createClient();
  const perfil = await perfilNucleo.obtenerPerfil(supabase, usuario.id).catch(() => null);
  const porCodigo = esEmailDeCuentaPorCodigo(usuario.email);
  const ultimoIngreso = usuario.last_sign_in_at
    ? new Intl.DateTimeFormat("es-AR", {
        timeZone: "America/Argentina/Buenos_Aires",
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(usuario.last_sign_in_at))
    : null;

  return (
    <div className="flex flex-col gap-5 px-[18px] pb-10 pt-1.5">
      <TopBar volverA="/app/perfil" eyebrow="Preferencias" title="Seguridad" />

      <PinSeguridad uid={usuario.id} nombre={perfil?.nombre?.trim().split(/\s+/)[0] || "vita"} />

      <div className="flex items-center gap-3 rounded-[20px] bg-card px-4 py-[15px] shadow-card">
        <div className="min-w-0 flex-1">
          <div className="font-heading text-[14.5px] font-extrabold tracking-[-0.02em]">Verificación en dos pasos</div>
          <div className="mt-0.5 text-pretty text-[11.5px] font-medium leading-[1.4] text-subtle">
            {porCodigo
              ? "No aplica a una cuenta vinculada con el código de un familiar."
              : "Todavía no está disponible en vita. Si entrás con Google, podés activarla en los ajustes de tu cuenta de Google."}
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-[10.5px] font-bold text-slate-brand">Próximamente</span>
      </div>

      <Grupo titulo="Tu sesión">
        <Dato icon="user" label="Cuenta" valor={porCodigo ? "Cuenta vinculada con tu familiar" : (usuario.email ?? "Sin email")} />
        <Dato icon="shield" label="Cómo entrás" valor={porCodigo ? "Con el código de tu familiar" : "Con tu cuenta (Google o email)"} />
        {ultimoIngreso && <Dato icon="clock" label="Último ingreso" valor={ultimoIngreso} />}
      </Grupo>

      <Grupo titulo="Este dispositivo">
        <form action="/auth/signout" method="post">
          <FilaAccion
            icon="logout"
            label="Cerrar sesión en este dispositivo"
            sub="No cierra tu sesión en otros dispositivos"
          />
        </form>
      </Grupo>
    </div>
  );
}

function Dato({ icon, label, valor }: { icon: string; label: string; valor: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5 [&:not(:first-child)]:border-t [&:not(:first-child)]:border-foreground/[0.06]">
      <Tile icon={icon} />
      <div className="min-w-0 flex-1">
        <div className="eyebrow text-subtle">{label}</div>
        <div className="mt-0.5 break-words text-[14px] font-semibold">{valor}</div>
      </div>
    </div>
  );
}
