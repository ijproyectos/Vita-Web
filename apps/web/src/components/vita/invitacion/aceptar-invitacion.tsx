import { AvatarPersona } from "@/components/vita/avatar-persona";
import type { RolVinculo } from "@/lib/familia/tipos";
import { BotonPrincipal, BotonTexto, FilaPermiso, etiquetaRol } from "./piezas";

// B4 · "Vas a cuidar a X": qué puede hacer según el rol, antes de aceptar.
// Sin lista de avisos ni casilla de consentimiento (decisión de producto).
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
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-cream px-6 pb-10 pt-16">
      <div className="flex flex-1 flex-col">
        <AvatarPersona nombre={persona} color="violeta" size={64} />
        {saludo && <p className="mt-6 text-[15px] font-bold text-subtle">Hola, {saludo}</p>}
        <h1 className={`${saludo ? "mt-1" : "mt-6"} text-balance font-heading text-[30px] font-extrabold leading-[1.12] tracking-[-0.04em]`}>
          Vas a cuidar a {persona}
        </h1>

        <div className="mt-7 rounded-[20px] bg-card p-5 shadow-card">
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

      <div className="mt-8 flex flex-col gap-1">
        <BotonPrincipal onClick={onContinuar}>Continuar</BotonPrincipal>
        <BotonTexto onClick={onAhoraNo}>Ahora no</BotonTexto>
      </div>
    </div>
  );
}
