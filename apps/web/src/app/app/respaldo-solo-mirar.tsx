"use client";

import { useState, type ReactNode } from "react";
import { RefrescoPeriodico } from "@/components/vita/refresco-periodico";

// Sostiene el inicio "solo mirar" entre actualizaciones. Si una lectura falla, deja
// lo último que se vio y lo dice, para no mostrar datos viejos como si fueran de
// ahora; la actualización sigue corriendo y lo arregla sola. Sin nada para mostrar
// (la primera carga falló), lanza: un "no hay tomas" sería falso.
// Usar con key por persona: lo último de una persona nunca se muestra en otra.
export function RespaldoSoloMirar({ fallo = false, children }: { fallo?: boolean; children?: ReactNode }) {
  const [ultimo, setUltimo] = useState<ReactNode>(fallo ? null : children);
  if (!fallo && ultimo !== children) setUltimo(children);
  if (fallo && !ultimo) throw new Error("No se pudieron leer los datos del inicio solo mirar.");

  return (
    <>
      <RefrescoPeriodico />
      {fallo && (
        <p role="status" className="mx-[18px] mt-2 rounded-[var(--radius-item)] bg-aviso-tint px-4 py-2.5 text-[13px] font-semibold text-aviso-ink">
          No pudimos actualizar. Esto es lo último que vimos.
        </p>
      )}
      {fallo ? ultimo : children}
    </>
  );
}
