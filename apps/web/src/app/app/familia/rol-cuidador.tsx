"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { VitaIcon } from "@/lib/vita-icons";
import { cn } from "@/lib/utils";
import { ETIQUETA_ROL, type RolVinculo } from "@/lib/familia/tipos";
import { cambiarRolCuidadorAction } from "./actions";

// Permiso de uno de MIS cuidadores (V7 fam-member "Permiso"): lo decide la
// persona cuidada, dueña de la cuenta. Admin = ve y edita; Lector = solo ve.
export function RolCuidador({ vinculoId, rol, nombre }: { vinculoId: string; rol: RolVinculo; nombre: string }) {
  const [actual, setActual] = useState<RolVinculo>(rol);
  const [pendiente, startTransition] = useTransition();

  function elegir(nuevo: RolVinculo) {
    if (nuevo === actual) return;
    const anterior = actual;
    setActual(nuevo);
    startTransition(async () => {
      try {
        const r = await cambiarRolCuidadorAction(vinculoId, nuevo);
        if (r.status === "error") {
          setActual(anterior);
          toast.error(r.message);
          return;
        }
        toast.success(`${nombre} ahora es ${ETIQUETA_ROL[nuevo].titulo}`);
      } catch {
        setActual(anterior);
        toast.error("No pudimos cambiar el permiso.");
      }
    });
  }

  return (
    <div role="radiogroup" aria-label={`Permiso de ${nombre}`} className="mt-3 grid grid-cols-2 gap-2">
      {(["editar", "ver"] as const).map((r) => {
        const activo = actual === r;
        return (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={activo}
            disabled={pendiente}
            onClick={() => elegir(r)}
            className={cn(
              "flex items-start gap-2 rounded-[var(--radius-item)] p-2.5 text-left transition-shadow disabled:opacity-60",
              activo ? "bg-card ring-2 ring-primary" : "bg-secondary"
            )}
          >
            <VitaIcon name={r === "editar" ? "edit" : "eye"} size={16} className="mt-0.5 shrink-0 text-teal-deep" />
            <span className="min-w-0">
              <span className="block font-heading text-[13px] font-extrabold">{ETIQUETA_ROL[r].titulo}</span>
              <span className="mt-0.5 block text-[11px] font-medium leading-[1.35] text-subtle">{ETIQUETA_ROL[r].sub}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
