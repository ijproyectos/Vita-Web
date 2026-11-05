import { AvatarPersona } from "@/components/vita/avatar-persona";
import { BotonCta } from "@/components/vita/auth-ui";
import type { RolVinculo } from "@/lib/familia/tipos";
import { avisosDeCuidador } from "@/lib/notificaciones/avisos-cuidador";
import { FilaPermiso, PantallaInvitada, etiquetaRol } from "./piezas";

// B4 · "Vas a cuidar a X": qué puede hacer según el rol y qué avisos le llegan.
// "Empezar" abre la pregunta de notificaciones del sistema y, responda lo que
// responda, sigue el flujo: esa pregunta es la que decide, no hay otro paso.
export function AceptarInvitacion({
  nombre,
  persona,
  rol,
  esPerfilGestionado,
  onEmpezar,
}: {
  /** Nombre de quien recibe; sin nombre se omite el saludo. */
  nombre?: string | null;
  persona: string;
  rol: RolVinculo;
  /** Solo en un perfil gestionado el Admin invita y quita cuidadores. */
  esPerfilGestionado?: boolean;
  onEmpezar?: () => void;
}) {
  const saludo = nombre?.trim();
  const admin = rol === "editar";
  return (
    <PantallaInvitada>
      <div className="flex flex-1 flex-col items-center">
        <AvatarPersona nombre={persona} color="violeta" size={72} />
        {saludo && <p className="mt-3.5 text-[15px] font-bold text-subtle">Hola, {saludo}</p>}
        <h1 className={`${saludo ? "mt-1" : "mt-3.5"} text-balance text-center font-heading text-[28px] font-extrabold leading-none tracking-[-0.04em]`}>
          Vas a cuidar a {persona}
        </h1>
        <div className="mt-5 flex flex-col self-stretch rounded-[24px] bg-card px-5 py-4 shadow-card">
          <h2 className="eyebrow text-subtle">Como {etiquetaRol(rol)} podés</h2>
          <ul className="mt-3.5 flex flex-col gap-3">
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
        <div className="mt-3 flex flex-col self-stretch rounded-[24px] bg-card px-5 py-4 shadow-card">
          <h2 className="eyebrow text-subtle">Te van a llegar avisos de</h2>
          <ul className="mt-1.5">
            {avisosDeCuidador(rol).map((aviso, i) => (
              <li key={aviso.titulo} className={`py-2.5 ${i > 0 ? "border-t border-foreground/[0.06]" : ""}`}>
                <div className="text-[14px] font-extrabold">{aviso.titulo}</div>
                <div className="mt-0.5 text-[11.5px] font-medium text-subtle">{aviso.detalle}</div>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="mt-5 flex flex-col">
        <BotonCta type="button" grande onClick={onEmpezar}>
          Empezar
        </BotonCta>
      </div>
    </PantallaInvitada>
  );
}
