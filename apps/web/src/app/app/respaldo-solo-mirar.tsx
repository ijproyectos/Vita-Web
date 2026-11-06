"use client";

import { useState, type ReactNode } from "react";
import { RefrescoPeriodico } from "@/components/vita/refresco-periodico";
import { contenidoDeRespaldo } from "@/lib/familia/solo-mirar";

// Sostiene el inicio "solo mirar" entre actualizaciones (ver contenidoDeRespaldo).
// Usar con key por persona: lo último de una persona nunca se muestra en otra.
export function RespaldoSoloMirar({ fallo = false, children }: { fallo?: boolean; children?: ReactNode }) {
  const [ultimo, setUltimo] = useState<ReactNode>(fallo ? null : children);
  if (!fallo && ultimo !== children) setUltimo(children);
  const { contenido, aviso } = contenidoDeRespaldo(fallo, ultimo, children);

  return (
    <>
      <RefrescoPeriodico />
      {aviso && (
        <p role="status" className="mx-[18px] mt-2 rounded-[var(--radius-item)] bg-aviso-tint px-4 py-2.5 text-[13px] font-semibold text-aviso-ink">
          No pudimos actualizar. Esto es lo último que vimos.
        </p>
      )}
      {contenido}
    </>
  );
}
