import { requireUser } from "@/lib/dal";
import { esEmailDeCuentaPorCodigo } from "@/lib/acceso-codigo/tipos";
import { TopBar } from "../../top-bar";
import { FilaAccion, Grupo, Tile } from "../filas";

// Seguridad (V7): información real de la sesión + cierre de sesión en este
// dispositivo. No hay PIN ni verificación en dos pasos: el acceso es con
// Google (o con el código de un familiar), no se simulan controles.
export default async function SeguridadPage() {
  const usuario = await requireUser();
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
    <div className="flex flex-col gap-[22px] px-[18px] pb-10 pt-1.5">
      <TopBar eyebrow="Cuenta" title="Seguridad" />

      <Grupo titulo="Tu sesión">
        <Dato icon="user" label="Cuenta" valor={porCodigo ? "Cuenta vinculada con tu familiar" : (usuario.email ?? "Sin email")} />
        <Dato icon="shield" label="Cómo entrás" valor={porCodigo ? "Con el código de tu familiar" : "Con tu cuenta de Google"} />
        {ultimoIngreso && <Dato icon="clock" label="Último ingreso" valor={ultimoIngreso} />}
      </Grupo>

      <p className="px-0.5 text-[12.5px] font-medium leading-[1.5] text-subtle">
        {porCodigo
          ? "Estás usando una cuenta vinculada con el código de un familiar."
          : "La contraseña y la verificación en dos pasos de tu cuenta las administra Google. Si querés reforzarlas, hacelo desde los ajustes de tu cuenta de Google."}
      </p>

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
