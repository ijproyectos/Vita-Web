"use client";

import type { ReactNode } from "react";
import { VitaIcon } from "@/lib/vita-icons";
import { cn } from "@/lib/utils";
import { CLASES_COLOR } from "@/lib/familia/colores";
import type { OpcionPerfil, PerfilActivo } from "@/lib/familia/tipos";
import { SelectorPerfil } from "./selector-perfil";

// Encabezado V7 "EYEBROW + nombre grande + chevron" de Home, Rutina, Mi Salud y
// Perfil. Con familia (más de un perfil para elegir) el nombre de la persona
// activa abre el selector de perfiles; sin familia es el título fijo de la
// pantalla ("Tu día de salud" / "Mi Rutina"), igual que el diseño.
export function EncabezadoPerfil({
  perfil,
  opciones,
  eyebrowSelector,
  estatico,
  nombre,
  pie,
  accion,
}: {
  perfil: PerfilActivo;
  opciones: OpcionPerfil[];
  /** Eyebrow cuando hay selector ("Rutina de", "Salud de", "Perfil de"). */
  eyebrowSelector: string;
  /** Eyebrow + título cuando no hay familia. */
  estatico: { eyebrow: string; titulo: ReactNode; eyebrowClassName?: string };
  /** Nombre a mostrar en modo selector (default: primer nombre del perfil activo). */
  nombre?: string;
  /** Contenido bajo el título (ej. la pastilla "Lector"). */
  pie?: ReactNode;
  /** Botón de la derecha (agregar, campana). */
  accion?: ReactNode;
}) {
  const conSelector = opciones.length > 1;
  const color = CLASES_COLOR[perfil.color];
  const mostrado = nombre ?? perfil.nombre.split(" ")[0];

  return (
    <div className="mt-1.5 flex items-start justify-between">
      <div className="min-w-0">
        {conSelector ? (
          <SelectorPerfil
            opciones={opciones}
            activoId={perfil.id}
            ariaLabel={`${eyebrowSelector} ${mostrado}. Cambiar de perfil`}
            className="flex flex-col items-start text-left transition-opacity active:opacity-70 motion-reduce:transition-none"
          >
            <span className={cn("eyebrow", color.texto)}>{eyebrowSelector}</span>
            <span className="mt-[5px] flex items-center gap-[9px]">
              <span className={cn("font-heading text-[28px] font-extrabold tracking-[-0.04em]", color.tinta)}>{mostrado}</span>
              <span aria-hidden className={cn("flex size-[26px] shrink-0 items-center justify-center rounded-full", color.fondo, color.texto)}>
                <VitaIcon name="chevron-down" size={14} strokeWidth={2.8} />
              </span>
            </span>
          </SelectorPerfil>
        ) : (
          <>
            <div className={cn("eyebrow", estatico.eyebrowClassName ?? "text-primary")}>{estatico.eyebrow}</div>
            <h1 className="mt-[5px] font-heading text-[28px] font-extrabold tracking-[-0.04em]">{estatico.titulo}</h1>
          </>
        )}
        {pie}
      </div>
      {accion}
    </div>
  );
}

/** Pastilla "Lector" (Home): quien solo mira el perfil de otra persona. */
export function PastillaLector() {
  return (
    <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-card px-[11px] py-[5px] text-[12.5px] font-extrabold text-slate-brand shadow-card">
      <VitaIcon name="eye" size={13} strokeWidth={2.2} />
      Lector
    </div>
  );
}
