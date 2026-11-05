import { BotonCta, TituloAuth } from "@/components/vita/auth-ui";
import { BotonTexto, IconoEstado, PantallaInvitada } from "./piezas";

// C2 · Entró con un mail distinto del invitado. La invitación solo vale con ese
// mail, así que los dos se muestran completos para que sepa con cuál entrar.
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
    <PantallaInvitada>
      <div className="flex flex-1 flex-col">
        <IconoEstado icono="mail" />
        <TituloAuth
          titulo="Esta invitación es para otro mail"
          sub={
            <>
              Entraste con <span className="break-all font-extrabold text-foreground">{emailActual}</span>. {invitador} te invitó con{" "}
              <span className="break-all font-extrabold text-foreground">{emailInvitado}</span>.
            </>
          }
        />
      </div>
      <div className="flex flex-col gap-2">
        <BotonCta type="button" grande onClick={onUsarOtra}>
          Usar otra cuenta
        </BotonCta>
        <BotonTexto onClick={onPedirCambio}>Pedirle que cambie el mail</BotonTexto>
      </div>
    </PantallaInvitada>
  );
}
