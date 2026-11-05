import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { VitaIcon } from "@/lib/vita-icons";
import { ETIQUETA_ROL, type RolVinculo } from "@/lib/familia/tipos";

// Piezas compartidas de las pantallas de la persona invitada (diseño
// "Invitar a un cuidador"). Solo presentación: los callbacks son opcionales
// para poder mostrarlas en la vista previa con botones inertes.

/** Texto del permiso tal como lo ve quien invita y quien recibe. */
export function etiquetaRol(rol: RolVinculo): string {
  return ETIQUETA_ROL[rol].titulo;
}

/** Seis cajas de solo lectura (A2 muestra el código; C1 lo que se escribió). */
export function CajasCodigo({ valor, error }: { valor: string; error?: boolean }) {
  const caracteres = Array.from(valor);
  return (
    <div className="grid grid-cols-6 gap-2" role="img" aria-label={`Código ${caracteres.join(" ")}`}>
      {Array.from({ length: 6 }, (_, i) => (
        <div
          key={i}
          className={cn(
            "flex h-14 items-center justify-center rounded-[var(--radius-item)] bg-card font-heading text-[26px] font-extrabold tabular-nums",
            error ? "shadow-[0_0_0_1.5px_var(--destructive)]" : "shadow-[0_0_0_1px_var(--line)]"
          )}
        >
          {caracteres[i] ?? ""}
        </div>
      ))}
    </div>
  );
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

/** Botón de texto secundario ("Ahora no", "Usar otra cuenta"). */
export function BotonTexto({ children, onClick, peligro }: { children: ReactNode; onClick?: () => void; peligro?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("h-[52px] text-base font-bold", peligro ? "text-destructive" : "text-slate-brand")}
    >
      {children}
    </button>
  );
}

/** Botón blanco con aro (Google, mail). */
export function BotonAro({ children, onClick, icono }: { children: ReactNode; onClick?: () => void; icono?: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-[54px] w-full items-center justify-center gap-2.5 rounded-full border border-line bg-card font-heading text-[15.5px] font-bold transition-transform active:scale-[0.98]"
    >
      {icono}
      {children}
    </button>
  );
}

/** Botón principal teal de las pantallas de la invitación. */
export function BotonPrincipal({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-[60px] w-full rounded-full bg-primary font-heading text-lg font-extrabold text-primary-foreground shadow-cta transition-transform active:scale-[0.98]"
    >
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
