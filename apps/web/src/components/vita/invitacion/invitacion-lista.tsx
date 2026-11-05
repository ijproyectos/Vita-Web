import { VitaIcon } from "@/lib/vita-icons";
import type { RolVinculo } from "@/lib/familia/tipos";
import { CajasCodigo, etiquetaRol } from "./piezas";

// A2 · "Invitación lista": lo que ve quien invita después de crear la
// invitación. Código de 6 dígitos + resumen + WhatsApp / Copiar. Los avisos
// no se muestran (la invitación no los guarda todavía).
export function InvitacionLista({
  codigo,
  persona,
  invitado,
  rol,
  email,
  diasVigencia = 7,
  onVolver,
  onWhatsApp,
  onCopiar,
  onListo,
}: {
  codigo: string;
  /** La persona que va a cuidar (Jesus). */
  persona: string;
  /** Quien recibe la invitación (Martina), si se lo nombró. */
  invitado?: string | null;
  rol: RolVinculo;
  email?: string | null;
  diasVigencia?: number;
  onVolver?: () => void;
  onWhatsApp?: () => void;
  onCopiar?: () => void;
  onListo?: () => void;
}) {
  const quien = invitado?.trim();
  return (
    <div className="flex flex-col gap-[18px] px-[18px] pb-10 pt-1.5">
      <div className="mt-1.5 flex items-center gap-3">
        <button
          type="button"
          onClick={onVolver}
          aria-label="Volver"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-card shadow-card transition-transform active:scale-[0.94]"
        >
          <VitaIcon name="chevron-left" size={18} strokeWidth={2.2} />
        </button>
        <div>
          <div className="eyebrow text-primary">Familia</div>
          <h1 className="mt-0.5 font-heading text-[22px] font-extrabold tracking-[-0.02em]">Invitación lista</h1>
        </div>
      </div>

      <div className="rounded-[20px] bg-card p-4 shadow-card">
        <div className="eyebrow text-subtle">{quien ? `Código para ${quien}` : "Código de la invitación"}</div>
        <div className="mt-3 rounded-[16px] bg-secondary p-3.5">
          <CajasCodigo valor={codigo} />
        </div>
        <dl className="mt-3 flex flex-col text-[14.5px]">
          <Fila etiqueta="Cuida a" valor={persona} />
          <Fila etiqueta="Permiso" valor={etiquetaRol(rol)} />
          {email && <Fila etiqueta="Entra con" valor={email} />}
        </dl>
      </div>

      <div className="flex gap-2.5">
        <button
          type="button"
          onClick={onWhatsApp}
          className="flex h-[52px] flex-1 items-center justify-center gap-2 rounded-full bg-primary font-heading text-[15px] font-extrabold text-primary-foreground shadow-cta"
        >
          <VitaIcon name="share" size={17} />
          Enviar por WhatsApp
        </button>
        <button
          type="button"
          onClick={onCopiar}
          className="flex h-[52px] items-center justify-center gap-2 rounded-full border border-line bg-card px-5 font-heading text-[15px] font-extrabold"
        >
          <VitaIcon name="copy" size={17} />
          Copiar
        </button>
      </div>

      <p className="px-1 text-pretty text-[12.5px] font-medium leading-[1.5] text-subtle">
        El mensaje lleva un link que abre vita con el código ya cargado. Vence en {diasVigencia} días.
        {quien ? ` Te avisamos cuando ${quien} entre.` : " Te avisamos cuando entre."}
      </p>

      <button
        type="button"
        onClick={onListo}
        className="h-14 rounded-full bg-secondary font-heading text-base font-extrabold text-foreground"
      >
        Listo
      </button>
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
