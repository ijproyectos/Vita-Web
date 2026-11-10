"use client";

import { useEffect, useState } from "react";
import { consultaMapa, urlMapaEmbebido } from "@/lib/turnos/mapa";

// Mapa embebido del lugar del turno, abajo de los campos: la persona escribe
// el lugar o la dirección y ve dónde queda para confirmar, sin salir de la
// app. No guarda nada (lo que se guarda es el texto). Espera a que deje de
// escribir para no pedirle un mapa a Google por cada letra.

const ESPERA_MS = 900;
const CLAVE = process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY;

export function MapaLugar({ lugar, direccion }: { lugar: string; direccion?: string }) {
  const consulta = consultaMapa(lugar, direccion);
  const [mostrada, setMostrada] = useState<string | null>(consulta);

  useEffect(() => {
    const t = setTimeout(() => setMostrada(consulta), ESPERA_MS);
    return () => clearTimeout(t);
  }, [consulta]);

  if (!consulta || !mostrada) return null;
  return (
    <div className="overflow-hidden rounded-[var(--radius-item)] bg-card shadow-item">
      <iframe
        key={mostrada}
        title={`Mapa de ${mostrada}`}
        src={urlMapaEmbebido(mostrada, CLAVE)}
        loading="lazy"
        referrerPolicy="no-referrer"
        className="block h-[180px] w-full border-0"
      />
      <p className="px-3.5 py-2.5 text-[12px] font-medium text-subtle">¿Es acá? Si no, escribí la dirección completa.</p>
    </div>
  );
}
