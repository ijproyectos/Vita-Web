"use client";

import { useState } from "react";
import Link from "next/link";
import { Segmentado } from "@/components/vita/segmentado";
import { VitaIcon } from "@/lib/vita-icons";
import type { PersonaDatos } from "../privacidad/personas";

// "Descargar PDF" de Para tu médico: abre el resumen listo para imprimir o
// guardar como PDF. Con personas a cargo (permiso Admin) se elige de quién.
export function DescargarPdf({ personas }: { personas: PersonaDatos[] }) {
  const [quien, setQuien] = useState(personas[0].id);
  const persona = personas.find((p) => p.id === quien) ?? personas[0];
  const href = persona.esPropio ? "/app/perfil/compartir/pdf" : `/app/perfil/compartir/pdf?de=${encodeURIComponent(persona.id)}`;

  return (
    <div className="flex flex-col gap-3 rounded-[20px] bg-card p-4 shadow-card">
      {personas.length > 1 && (
        <div className="flex flex-col gap-2">
          <div className="pl-0.5 text-[12.5px] font-semibold text-slate-brand">De quién</div>
          <Segmentado chico etiqueta="De quién es el resumen" opciones={personas.map((p) => ({ valor: p.id, etiqueta: p.etiqueta }))} valor={quien} onChange={setQuien} />
        </div>
      )}
      <Link
        href={href}
        className="flex items-center justify-center gap-2 rounded-full bg-primary py-3.5 font-heading text-[14.5px] font-extrabold text-primary-foreground shadow-cta transition-transform active:scale-[0.98] motion-reduce:transition-none"
      >
        <VitaIcon name="doc" size={17} />
        Descargar PDF
      </Link>
      <p className="-mt-1 text-center text-[11.5px] font-medium leading-[1.4] text-subtle">Se abre el resumen listo para imprimir o guardar como PDF.</p>
    </div>
  );
}
