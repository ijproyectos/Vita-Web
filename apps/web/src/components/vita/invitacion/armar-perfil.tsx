import { BotonCta, TituloAuth } from "@/components/vita/auth-ui";
import { VitaIcon } from "@/lib/vita-icons";
import { BotonTexto, PantallaInvitada } from "./piezas";

// D1 · "Tu perfil": pantalla completa que explica qué es y lo deja armar el
// suyo con vita o a mano. Aclara que es privado.
export function ArmarPerfil({
  nombre,
  persona,
  invitador,
  titulo,
  onConVita,
  onYo,
  onAhoraNo,
}: {
  /** Título propio (por defecto: "Llevá tu salud en vita, <nombre>"). */
  titulo?: string;
  nombre?: string | null;
  /** A quien ya cuida (para aclarar que sigue viéndola). */
  persona?: string | null;
  /** Quien la invitó (para aclarar que no ve este perfil). */
  invitador?: string | null;
  onConVita?: () => void;
  onYo?: () => void;
  onAhoraNo?: () => void;
}) {
  const primero = nombre?.trim().split(/\s+/)[0];
  const beneficios = [
    { icono: "pill", texto: "Tus remedios, con avisos a tu hora" },
    { icono: "calendar", texto: "Tus turnos y estudios en un lugar" },
    { icono: "sparkle", texto: "Hablar con vita sobre tu salud" },
  ];
  return (
    <PantallaInvitada>
      <div className="flex flex-1 flex-col">
        <TituloAuth titulo={titulo ?? (primero ? `Llevá tu salud en vita, ${primero}` : "Llevá tu salud en vita")} />
        <ul className="mt-7 flex flex-col gap-3.5">
          {beneficios.map((b) => (
            <li key={b.icono} className="flex items-center gap-3 text-[15.5px] font-semibold">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-tile)] bg-persona-1-tint text-teal-deep">
                <VitaIcon name={b.icono} size={19} />
              </span>
              {b.texto}
            </li>
          ))}
        </ul>
        <p className="mt-7 text-pretty rounded-[var(--radius-item)] bg-card p-4 text-[13.5px] font-medium leading-[1.5] text-slate-brand shadow-card">
          Es solo tuyo.
          {invitador ? ` ${invitador} no lo ve` : " Nadie más lo ve"}
          {persona ? `, y vos seguís viendo a ${persona} como hasta ahora.` : "."}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <BotonCta type="button" grande onClick={onConVita}>
          Armarlo con vita
        </BotonCta>
        <BotonTexto onClick={onYo}>Armarlo yo</BotonTexto>
        <BotonTexto onClick={onAhoraNo}>Ahora no</BotonTexto>
      </div>
    </PantallaInvitada>
  );
}
