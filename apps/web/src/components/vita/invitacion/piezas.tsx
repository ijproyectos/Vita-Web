import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { PantallaAuth } from "@/components/vita/auth-ui";
import { VitaIcon } from "@/lib/vita-icons";
import { ETIQUETA_ROL, type RolVinculo } from "@/lib/familia/tipos";

// Piezas compartidas de las pantallas de la persona invitada (diseño
// "Invitar a un cuidador"). Solo presentación: los callbacks son opcionales
// para poder mostrarlas en la vista previa con botones inertes.

/** Texto del permiso tal como lo ve quien invita y quien recibe. */
export function etiquetaRol(rol: RolVinculo): string {
  return ETIQUETA_ROL[rol].titulo;
}

/** Fila ✓ / ✗ de lo que se puede (o no) hacer con un rol. */
export function FilaPermiso({ permitido, children }: { permitido: boolean; children: ReactNode }) {
  return (
    <li className={cn("flex items-center gap-3 text-[15.5px] font-semibold", !permitido && "text-subtle")}>
      <span
        aria-hidden
        className={cn(
          "flex size-[26px] shrink-0 items-center justify-center rounded-full",
          permitido ? "bg-persona-1-tint text-teal-deep" : "bg-secondary text-faint"
        )}
      >
        <VitaIcon name={permitido ? "check" : "close"} size={14} strokeWidth={2.8} />
      </span>
      <span className="sr-only">{permitido ? "Podés: " : "No podés: "}</span>
      {children}
    </li>
  );
}

/** Pantalla de la persona invitada: el layout de acceso con el fondo de la app. */
export function PantallaInvitada({ children }: { children: ReactNode }) {
  return <PantallaAuth className="bg-background">{children}</PantallaAuth>;
}

/** Botón de texto secundario, igual al del login ("Ahora no", "Usar otra cuenta"). */
export function BotonTexto({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className="h-[52px] text-base font-bold text-slate-brand">
      {children}
    </button>
  );
}

/** Recuadro con ícono para los estados de error (C1, C2). */
export function IconoEstado({ icono }: { icono: string }) {
  return (
    <div className="flex size-14 items-center justify-center rounded-full bg-aviso-tint text-aviso-ink">
      <VitaIcon name={icono} size={26} />
    </div>
  );
}
