import { AvatarPersona } from "@/components/vita/avatar-persona";
import { BotonCta } from "@/components/vita/auth-ui";
import type { RolVinculo } from "@/lib/familia/tipos";
import { BotonTexto, FilaPermiso, PantallaInvitada, etiquetaRol } from "./piezas";

// B4 · "Vas a cuidar a X": qué puede hacer según el rol, antes de aceptar.
// Mismo aspecto que "¿Sos vos?" (ConfirmarPersona). Sin lista de avisos ni
// casilla de consentimiento (decisión de producto).
export function AceptarInvitacion({
  nombre,
  persona,
  rol,
  esPerfilGestionado,
  onContinuar,
  onAhoraNo,
}: {
  /** Nombre de quien recibe; sin nombre se omite el saludo. */
  nombre?: string | null;
  persona: string;
  rol: RolVinculo;
  /** Solo en un perfil gestionado el Admin invita y quita cuidadores. */
  esPerfilGestionado?: boolean;
  onContinuar?: () => void;
  onAhoraNo?: () => void;
}) {
  const saludo = nombre?.trim();
  const admin = rol === "editar";
  return (
    <PantallaInvitada>
      <div className="flex flex-1 flex-col items-center justify-center">
        <AvatarPersona nombre={persona} color="violeta" size={112} />
        {saludo && <p className="mt-[22px] text-[15px] font-bold text-subtle">Hola, {saludo}</p>}
        <h1 className={`${saludo ? "mt-1" : "mt-[22px]"} text-balance text-center font-heading text-[34px] font-extrabold leading-none tracking-[-0.04em]`}>
          Vas a cuidar a {persona}
        </h1>
        <div className="mt-[26px] flex flex-col self-stretch rounded-[24px] bg-card px-5 py-[18px] shadow-card">
          <h2 className="eyebrow text-subtle">Como {etiquetaRol(rol)} podés</h2>
          <ul className="mt-4 flex flex-col gap-3.5">
            <FilaPermiso permitido>Ver sus remedios, turnos y salud</FilaPermiso>
            <FilaPermiso permitido>Enterarte si no tomó algo</FilaPermiso>
            {admin ? (
              <>
                <FilaPermiso permitido>Cargar y cambiar sus datos</FilaPermiso>
                {esPerfilGestionado && <FilaPermiso permitido>Invitar y quitar cuidadores</FilaPermiso>}
              </>
            ) : (
              <FilaPermiso permitido={false}>Cambiar o cargar cosas</FilaPermiso>
            )}
          </ul>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <BotonCta type="button" grande onClick={onContinuar}>
          Continuar
        </BotonCta>
        <BotonTexto onClick={onAhoraNo}>Ahora no</BotonTexto>
      </div>
    </PantallaInvitada>
  );
}
