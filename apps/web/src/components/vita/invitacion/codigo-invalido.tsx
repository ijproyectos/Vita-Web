import { CajasCodigo, BotonPrincipal, BotonTexto, IconoEstado } from "./piezas";

// C1 · Código que no sirve. Dos variantes:
//  - "no-existe": no sabemos de quién era, así que no hay a quién avisar y no
//    se ofrece pedir uno nuevo.
//  - "vencido": la invitación existe, se puede pedirle a quien invitó que reenvíe.
export function CodigoInvalido({
  variante,
  codigo,
  invitador,
  onReintentar,
  onPedirNuevo,
}: {
  variante: "no-existe" | "vencido";
  /** Lo que escribió la persona. */
  codigo: string;
  invitador?: string | null;
  onReintentar?: () => void;
  onPedirNuevo?: () => void;
}) {
  const vencido = variante === "vencido";
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-cream px-6 pb-10 pt-16">
      <div className="flex flex-1 flex-col">
        <IconoEstado icono="alert-triangle" />
        <h1 className="mt-6 text-balance font-heading text-[28px] font-extrabold leading-[1.15] tracking-[-0.04em]">
          {vencido ? "Ese código venció" : "Ese código no existe"}
        </h1>
        <p className="mt-3 text-pretty text-[16px] font-medium leading-[1.45] text-slate-brand">
          {vencido
            ? "Las invitaciones duran 7 días. Pedí un código nuevo y te lo reenvían."
            : "Revisá el mensaje que te mandaron y escribilo de nuevo."}
        </p>
        <div className="mt-7">
          <CajasCodigo valor={codigo} error />
        </div>
        {vencido && (
          <p className="mt-4 text-[12.5px] font-medium text-subtle">
            Al pedirlo, le avisamos a {invitador?.trim() || "quien te invitó"} para que reenvíe.
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1">
        {vencido ? (
          <>
            <BotonPrincipal onClick={onPedirNuevo}>Pedir un código nuevo</BotonPrincipal>
            <BotonTexto onClick={onReintentar}>Escribir otro código</BotonTexto>
          </>
        ) : (
          <BotonPrincipal onClick={onReintentar}>Probar de nuevo</BotonPrincipal>
        )}
      </div>
    </div>
  );
}
