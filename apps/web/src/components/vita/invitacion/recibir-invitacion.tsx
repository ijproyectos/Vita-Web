import { AvatarPersona } from "@/components/vita/avatar-persona";
import { GoogleLogo } from "@/components/vita/auth-ui";
import { enmascararEmail } from "@/lib/email/enmascarar";
import type { RolVinculo } from "@/lib/familia/tipos";
import { PantallaInvitada, etiquetaRol } from "./piezas";

// B3 · Quién te invita y con qué cuenta entrás. Primero se ve a quién va a
// cuidar y quién la invitó; recién después se pide la cuenta. El bloque de
// cuenta es el de la bienvenida del login. Sin Apple.
export function RecibirInvitacion({
  invitador,
  persona,
  relacion,
  rol,
  email,
  onGoogle,
  onEmail,
  onEntrar,
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
  onEntrar?: () => void;
}) {
  return (
    <PantallaInvitada>
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="flex items-center" aria-hidden>
          <AvatarPersona nombre={invitador} color="teal" size={64} className="ring-4 ring-background" />
          <AvatarPersona nombre={persona} color="violeta" size={64} className="-ml-3 ring-4 ring-background" />
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
        <button
          type="button"
          onClick={onGoogle}
          className="flex h-[54px] items-center justify-center gap-2.5 rounded-full border border-line bg-card font-heading text-[15.5px] font-bold transition-transform active:scale-[0.98] disabled:opacity-60"
        >
          <GoogleLogo />
          Continuar con Google
        </button>
        <button type="button" onClick={onEmail} className="h-11 text-[14.5px] font-bold text-slate-brand">
          Continuar con email
        </button>
      </div>
      <div className="mb-4 mt-1.5 h-px bg-line-cream" />
      <div className="text-center text-sm font-medium text-slate-brand">
        ¿Ya tenés cuenta?{" "}
        <button type="button" onClick={onEntrar} className="font-extrabold text-teal-deep">
          Entrar
        </button>
      </div>
    </PantallaInvitada>
  );
}
