import { cn } from "@/lib/utils";
import { CLASES_COLOR } from "@/lib/familia/colores";
import type { ColorPerfil } from "@/lib/familia/tipos";

// Chip redondo con la inicial de la persona, en su color de perfil (Familia).
export function AvatarPersona({
  nombre,
  color,
  size = 40,
  className,
}: {
  nombre: string;
  color: ColorPerfil;
  size?: number;
  className?: string;
}) {
  const clases = CLASES_COLOR[color];
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-heading font-extrabold",
        clases.fondo,
        clases.tinta,
        className
      )}
    >
      {(nombre.trim().charAt(0) || "?").toUpperCase()}
    </span>
  );
}
