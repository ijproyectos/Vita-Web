import { AvatarPersona } from "@/components/vita/avatar-persona";
import { VitaIcon } from "@/lib/vita-icons";
import { enmascararEmail } from "@/lib/email/enmascarar";
import type { RolVinculo } from "@/lib/familia/tipos";
import { BotonAro, etiquetaRol } from "./piezas";

// B3 · Quién te invita y con qué cuenta entrás. Primero se ve a quién va a
// cuidar y quién la invitó; recién después se pide la cuenta. Sin Apple.
export function RecibirInvitacion({
  invitador,
  persona,
  relacion,
  rol,
  email,
  onGoogle,
  onEmail,
}: {
  invitador: string;
  persona: string;
  /** Cómo se relaciona la persona con quien recibe ("Tu papá"). */
  relacion?: string | null;
  rol: RolVinculo;
  /** Mail con el que invitaron; se muestra siempre enmascarado. */
  email?: string | null;
  onGoogle?: () => void;
  onEmail?: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-cream px-6 pb-10 pt-16">
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="flex items-center" aria-hidden>
          <AvatarPersona nombre={invitador} color="teal" size={64} className="ring-4 ring-cream" />
          <AvatarPersona nombre={persona} color="violeta" size={64} className="-ml-3 ring-4 ring-cream" />
        </div>
        <h1 className="mt-6 text-balance font-heading text-[28px] font-extrabold leading-[1.15] tracking-[-0.04em]">
          {invitador} te invitó a cuidar a {persona}
        </h1>
        <p className="mt-3 text-[16px] font-semibold text-slate-brand">
          {relacion ? `${relacion} · entrás como ` : "Entrás como "}
          <span className="font-extrabold text-teal-deep">{etiquetaRol(rol)}</span>
        </p>
        {email && (
          <p className="mt-4 text-pretty text-[14.5px] font-medium leading-[1.45] text-subtle">
            Entrá con <span className="font-extrabold text-foreground">{enmascararEmail(email)}</span>, el mail que puso {invitador}.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2.5">
        <BotonAro onClick={onGoogle} icono={<GoogleLogo />}>
          Continuar con Google
        </BotonAro>
        <BotonAro onClick={onEmail} icono={<VitaIcon name="mail" size={18} />}>
          Entrar con mi mail y contraseña
        </BotonAro>
      </div>
      <p className="mt-4 text-center text-[12.5px] font-medium text-subtle">
        Primero ves a quién vas a cuidar; recién después te pedimos la cuenta.
      </p>
    </div>
  );
}

// Logo de marca de Google: colores fijos, por eso vive como SVG estático.
function GoogleLogo() {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/google-g.svg" alt="" width={19} height={19} aria-hidden="true" />;
}
