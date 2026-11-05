"use client";

import { useEffect } from "react";
import { programarRefresco } from "@/lib/navegacion/refresco";

// Si una lectura falla, esta pantalla reemplaza a la que se estaba viendo, sin datos
// de nadie: es preferible a mostrar a la persona equivocada. Reintenta sola, así que
// quien dejó la app abierta (un Lector mirando las tomas) vuelve a verlas sin tocar nada.
export default function ErrorDeLaApp({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  useEffect(() => programarRefresco(retry), [retry]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-3 bg-background px-6 text-center">
      <h1 className="text-balance font-heading text-[28px] font-extrabold leading-[1.15] tracking-[-0.04em]">No pudimos cargar esto</h1>
      <p className="text-pretty text-[15px] font-medium leading-[1.45] text-subtle">Lo volvemos a intentar solos en un momento.</p>
      <button
        type="button"
        onClick={() => retry()}
        className="mt-3 w-full rounded-full bg-primary py-[15px] font-heading text-sm font-extrabold text-primary-foreground"
      >
        Probar de nuevo
      </button>
    </main>
  );
}
