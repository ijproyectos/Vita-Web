"use client";

import { VitaIcon } from "@/lib/vita-icons";

// Acciones de la página de historial. Todo este bloque se oculta al
// imprimir (clase `no-imprimir`, ver globals.css): el PDF sale solo con
// el reporte.
export function BotonesExportar() {
  return (
    <div className="no-imprimir flex flex-col gap-2.5">
      <button
        type="button"
        onClick={() => window.print()}
        className="flex h-12 items-center justify-center gap-2 rounded-full bg-primary font-heading text-[15px] font-bold text-primary-foreground"
      >
        <VitaIcon name="doc" size={18} />
        Descargar PDF
      </button>
      <p className="px-2 text-center text-[12px] leading-snug text-muted-foreground">
        En el celular: Compartir → Imprimir → Guardar como PDF
      </p>
      <a
        href="/app/perfil/historial/datos"
        download
        className="flex h-12 items-center justify-center gap-2 rounded-full bg-secondary font-heading text-[15px] font-bold text-secondary-foreground"
      >
        <VitaIcon name="upload" size={18} />
        Descargar mis datos (JSON)
      </a>
    </div>
  );
}
