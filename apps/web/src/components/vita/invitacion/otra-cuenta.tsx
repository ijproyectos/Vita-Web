import { enmascararEmail } from "@/lib/email/enmascarar";
import { BotonPrincipal, BotonTexto, IconoEstado } from "./piezas";

// C2 · Entró con un mail distinto del invitado. Los dos mails se muestran
// siempre enmascarados.
export function OtraCuenta({
  emailActual,
  emailInvitado,
  invitador,
  onUsarOtra,
  onPedirCambio,
}: {
  emailActual: string;
  emailInvitado: string;
  invitador: string;
  onUsarOtra?: () => void;
  onPedirCambio?: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-cream px-6 pb-10 pt-16">
      <div className="flex flex-1 flex-col">
        <IconoEstado icono="mail" />
        <h1 className="mt-6 text-balance font-heading text-[28px] font-extrabold leading-[1.15] tracking-[-0.04em]">
          Esta invitación es para otro mail
        </h1>
        <p className="mt-3 text-pretty text-[16px] font-medium leading-[1.5] text-slate-brand">
          Entraste con <span className="font-extrabold text-foreground">{enmascararEmail(emailActual)}</span>. {invitador} te invitó con{" "}
          <span className="font-extrabold text-foreground">{enmascararEmail(emailInvitado)}</span>.
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <BotonPrincipal onClick={onUsarOtra}>Usar otra cuenta</BotonPrincipal>
        <BotonTexto onClick={onPedirCambio}>Pedirle que cambie el mail</BotonTexto>
      </div>
    </div>
  );
}
