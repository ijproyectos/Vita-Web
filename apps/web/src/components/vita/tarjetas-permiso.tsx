"use client";

import { cn } from "@/lib/utils";
import { VitaIcon } from "@/lib/vita-icons";
import type { RolVinculo } from "@/lib/familia/tipos";

// Tarjetas de permiso de V7 (Admin / Lector): icono, título, descripción y
// un círculo que se llena con el tilde al elegir. Controlada; `disabled` para
// quien solo puede mirar el permiso.
export function descripcionPermiso(rol: RolVinculo, puedeAdministrarCuidadores: boolean): string {
  if (rol === "ver") return "Ve remedios, turnos y salud, y recibe los avisos. No cambia nada.";
  return puedeAdministrarCuidadores
    ? "Ve y edita todo. Puede invitar y quitar cuidadores."
    : "Ve y edita sus remedios, turnos y salud.";
}

export function TarjetasPermiso({
  valor,
  onChange,
  disabled,
  etiqueta,
  puedeAdministrarCuidadores = true,
}: {
  valor: RolVinculo;
  onChange: (rol: RolVinculo) => void;
  disabled?: boolean;
  etiqueta: string;
  /** El Admin de esta persona puede invitar/quitar cuidadores (perfil gestionado). */
  puedeAdministrarCuidadores?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={etiqueta} className="flex flex-col gap-2.5">
      {(["editar", "ver"] as const).map((rol) => {
        const activo = valor === rol;
        return (
          <button
            key={rol}
            type="button"
            role="radio"
            aria-checked={activo}
            disabled={disabled}
            onClick={() => onChange(rol)}
            className={cn(
              "flex items-center gap-3.5 rounded-[20px] bg-card p-3.5 text-left transition-shadow active:scale-[0.99] disabled:opacity-60 motion-reduce:transition-none",
              activo ? "shadow-[0_0_0_2px_var(--primary),var(--elevation-card)]" : "shadow-card"
            )}
          >
            <span className="flex size-[52px] shrink-0 items-center justify-center rounded-[16px] bg-chip-teal-bg text-teal-deep">
              <VitaIcon name={rol === "editar" ? "edit" : "eye"} size={22} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-heading text-base font-extrabold tracking-[-0.02em]">
                {rol === "editar" ? "Admin" : "Lector"}
              </span>
              <span className="mt-0.5 block text-pretty text-[12.5px] font-medium leading-[1.4] text-slate-brand">
                {descripcionPermiso(rol, puedeAdministrarCuidadores)}
              </span>
            </span>
            <span
              aria-hidden
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full",
                activo ? "bg-primary text-primary-foreground" : "bg-card shadow-[inset_0_0_0_2px_var(--line-strong)]"
              )}
            >
              {activo && <VitaIcon name="check" size={13} strokeWidth={3.4} />}
            </span>
          </button>
        );
      })}
    </div>
  );
}
