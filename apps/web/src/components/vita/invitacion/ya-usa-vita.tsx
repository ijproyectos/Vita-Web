import { AvatarPersona } from "@/components/vita/avatar-persona";
import { colorPorDefecto } from "@/lib/familia/colores";
import { BotonPrincipal } from "./piezas";

// C3 · Ya tenía cuenta: la persona nueva se suma a su lista de perfiles.
export function YaUsaVita({
  yo,
  actuales,
  nueva,
  onContinuar,
}: {
  yo: string;
  /** Personas que ya cuidaba. */
  actuales: string[];
  nueva: string;
  onContinuar?: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-cream px-6 pb-10 pt-16">
      <div className="flex flex-1 flex-col">
        <h1 className="text-balance font-heading text-[28px] font-extrabold leading-[1.15] tracking-[-0.04em]">
          {nueva} se suma a tu lista
        </h1>
        <p className="mt-3 text-pretty text-[16px] font-medium leading-[1.45] text-slate-brand">
          Ya tenías cuenta. La vas a encontrar arriba, donde cambiás de perfil.
        </p>
        <ul className="mt-7 overflow-hidden rounded-[20px] bg-card shadow-card">
          <Fila nombre={yo} color={colorPorDefecto(0)} detalle="vos" />
          {actuales.map((n, i) => (
            <Fila key={`${n}-${i}`} nombre={n} color={colorPorDefecto(i + 1)} detalle="ya la cuidabas" />
          ))}
          <Fila nombre={nueva} color={colorPorDefecto(actuales.length + 1)} nuevo />
        </ul>
      </div>
      <BotonPrincipal onClick={onContinuar}>Continuar</BotonPrincipal>
    </div>
  );
}

function Fila({ nombre, color, detalle, nuevo }: { nombre: string; color: Parameters<typeof AvatarPersona>[0]["color"]; detalle?: string; nuevo?: boolean }) {
  return (
    <li className="flex items-center gap-3 px-4 py-3.5 [&:not(:first-child)]:border-t [&:not(:first-child)]:border-foreground/[0.06]">
      <AvatarPersona nombre={nombre} color={color} size={40} />
      <div className="min-w-0 flex-1 truncate font-heading text-[15px] font-extrabold">
        {nombre}
        {detalle && <span className="font-medium text-subtle"> · {detalle}</span>}
      </div>
      {nuevo && <span className="rounded-full bg-primary px-2.5 py-1 text-[11px] font-extrabold text-primary-foreground">Nuevo</span>}
    </li>
  );
}
