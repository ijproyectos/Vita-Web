import { VitaIcon } from "@/lib/vita-icons";
import { BotonPrincipal, BotonTexto } from "./piezas";

// "Ahora no": la invitación no se pierde, sigue abierta hasta que venza.
export function InvitacionPendiente({
  fechaVence,
  persona,
  onArmarPerfil,
  onCerrarSesion,
}: {
  /** Fecha ya formateada ("12 de noviembre"). */
  fechaVence: string;
  persona?: string | null;
  onArmarPerfil?: () => void;
  onCerrarSesion?: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-cream px-6 pb-10 pt-16">
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-persona-1-tint text-teal-deep">
          <VitaIcon name="clock" size={26} />
        </div>
        <h1 className="mt-6 text-balance font-heading text-[28px] font-extrabold leading-[1.15] tracking-[-0.04em]">
          La invitación sigue abierta hasta el {fechaVence}
        </h1>
        <p className="mt-3 text-pretty text-[16px] font-medium leading-[1.45] text-slate-brand">
          {persona ? `Cuando quieras cuidar a ${persona}, volvé a entrar con el mismo código.` : "Cuando quieras, volvé a entrar con el mismo código."}
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <BotonPrincipal onClick={onArmarPerfil}>Armar mi perfil</BotonPrincipal>
        <BotonTexto onClick={onCerrarSesion}>Cerrar sesión</BotonTexto>
      </div>
    </div>
  );
}
