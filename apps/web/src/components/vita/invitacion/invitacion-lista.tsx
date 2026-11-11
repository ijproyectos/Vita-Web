import { BotonCta, BotonVolver } from "@/components/vita/auth-ui";
import { PanelCodigoAcceso } from "@/components/vita/panel-codigo-acceso";
import { MINUTOS_VIGENCIA_CODIGO_ACCESO, textoDuracion } from "@/lib/acceso-codigo/tipos";
import type { RolVinculo } from "@/lib/familia/tipos";
import { etiquetaRol } from "./piezas";

// A2 · "Invitación lista": lo que ve quien invita después de crear la
// invitación. Reusa el panel del código de acceso (código, WhatsApp, Copiar y
// cuenta regresiva) + el resumen de la invitación. Los avisos no se muestran
// (la invitación no los guarda todavía).
export function InvitacionLista({
  codigo,
  expiraAt,
  persona,
  invitado,
  rol,
  email,
  onVolver,
  onGenerarOtro,
  generando,
  onListo,
}: {
  codigo: string;
  /** Vencimiento del código (ISO). */
  expiraAt: string;
  /** La persona que va a cuidar (Jesus). */
  persona: string;
  /** Quien recibe la invitación (Martina), si se lo nombró. */
  invitado?: string | null;
  rol: RolVinculo;
  email?: string | null;
  onVolver?: () => void;
  onGenerarOtro?: () => void;
  generando?: boolean;
  onListo?: () => void;
}) {
  const quien = invitado?.trim() || "quien invitás";
  return (
    <div className="flex flex-col gap-[18px] px-[18px] pb-10 pt-1.5">
      <div className="mt-1.5 flex items-center gap-3">
        <BotonVolver onClick={onVolver} />
        <div>
          <div className="eyebrow text-primary">Familia</div>
          <h1 className="mt-0.5 font-heading text-[22px] font-extrabold tracking-[-0.02em]">Invitación lista</h1>
        </div>
      </div>

      <PanelCodigoAcceso codigo={codigo} expiraAt={expiraAt} nombre={quien} onGenerarOtro={onGenerarOtro} generando={generando} />

      <dl className="flex flex-col rounded-[20px] bg-card px-4 py-1 text-[14.5px] shadow-card">
        <Fila etiqueta="Cuida a" valor={persona} />
        <Fila etiqueta="Permiso" valor={etiquetaRol(rol)} />
        {email && <Fila etiqueta="Entra con" valor={email} />}
      </dl>

      <p className="px-1 text-pretty text-[12px] font-medium leading-[1.45] text-subtle">
        El código vence en {textoDuracion(MINUTOS_VIGENCIA_CODIGO_ACCESO)} y sirve una sola vez.
      </p>

      <BotonCta type="button" onClick={onListo}>
        Listo
      </BotonCta>
    </div>
  );
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-foreground/[0.06] py-3 first:border-t-0">
      <dt className="font-medium text-subtle">{etiqueta}</dt>
      <dd className="min-w-0 truncate font-heading font-extrabold">{valor}</dd>
    </div>
  );
}
