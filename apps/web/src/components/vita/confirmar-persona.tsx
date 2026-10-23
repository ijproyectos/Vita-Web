import { BotonCta, PantallaAuth } from "@/components/vita/auth-ui";
import type { VistaPreviaCodigo } from "@/lib/acceso-codigo/tipos";

export const MENSAJE_CODIGO_DE_OTRO_PERFIL = "Ese código es de otro perfil. Pedile a tu familiar un código nuevo.";

// "¿Sos vos?" (Onboarding V7 `isWho`): antes de reclamar un código se muestra
// a quién pertenece, para que nadie quede vinculado al perfil equivocado.
export function ConfirmarPersona({
  vista,
  pendiente,
  onSi,
  onNo,
}: {
  vista: VistaPreviaCodigo;
  pendiente: boolean;
  onSi: () => void;
  onNo: () => void;
}) {
  const meds = vista.medicamentos;
  return (
    <PantallaAuth>
      <div className="flex flex-1 flex-col items-center justify-center">
        <div
          aria-hidden
          className="flex size-28 items-center justify-center rounded-full bg-persona-1-tint font-heading text-[46px] font-extrabold tracking-[-0.04em] text-persona-1-deep"
        >
          {vista.nombre.charAt(0).toUpperCase()}
        </div>
        <h1 className="mt-[22px] font-heading text-[34px] font-extrabold leading-none tracking-[-0.04em]">Hola, {vista.nombre}</h1>
        <p className="mt-3 text-balance text-center text-[17px] font-medium leading-[1.45] text-slate-brand">
          {vista.cuidador ? `${vista.cuidador} ya armó tu perfil.` : "Ya armaron tu perfil."} Fijate que seas vos.
        </p>
        <div className="mt-[26px] flex flex-col self-stretch rounded-[24px] bg-card px-5 py-[18px] shadow-card">
          <div className="font-heading text-xl font-extrabold tracking-[-0.3px]">{vista.nombreCompleto}</div>
          {vista.cuidador && <div className="mt-1 text-[15px] font-medium text-slate-brand">La cuida {vista.cuidador}</div>}
          {meds !== null && (
            <div className="mt-4 rounded-[16px] bg-canvas px-3.5 py-3">
              <div className="font-heading text-2xl font-extrabold leading-none">{meds}</div>
              <div className="mt-1 text-sm font-semibold text-slate-brand">{meds === 1 ? "remedio" : "remedios"}</div>
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <BotonCta type="button" grande onClick={onSi} disabled={pendiente}>
          {pendiente ? "Entrando…" : `Sí, soy ${vista.nombre}`}
        </BotonCta>
        <button
          type="button"
          onClick={onNo}
          disabled={pendiente}
          className="h-[52px] text-base font-bold text-slate-brand disabled:opacity-60"
        >
          No soy {vista.nombre}
        </button>
      </div>
    </PantallaAuth>
  );
}
