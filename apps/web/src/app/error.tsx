"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { FormCerrarSesion } from "@/components/vita/form-cerrar-sesion";
import { programarRefresco } from "@/lib/navegacion/refresco";
import { volverAMiPerfilAction } from "./app/familia/actions";

// Si una lectura falla, esta pantalla reemplaza a la que se estaba viendo, sin datos
// de nadie: es preferible a mostrar a la persona equivocada. Reintenta sola, así que
// quien dejó la app abierta (un Lector mirando las tomas) vuelve a verlas sin tocar nada.
// Dentro de la app ofrece salidas por si la falla dura: el cambio de perfil lo elige
// la persona, nunca es automático.
export default function ErrorDeLaApp({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const dentroDeLaApp = usePathname()?.startsWith("/app") ?? false;
  const [pendiente, startTransition] = useTransition();
  const [fallo, setFallo] = useState<string | null>(null);

  useEffect(() => {
    console.error(error);
  }, [error]);

  useEffect(() => programarRefresco(retry), [retry]);

  function irAMiPerfil() {
    setFallo(null);
    startTransition(async () => {
      const r = await volverAMiPerfilAction().catch(() => null);
      // Sin persona elegida ya no hace falta la lectura que falló: al reintentar abre lo propio.
      if (r?.status === "success") retry();
      else setFallo(r?.message ?? "No pudimos volver a tu perfil.");
    });
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-3 bg-background px-6 text-center">
      <h1 className="text-balance font-heading text-[28px] font-extrabold leading-[1.15] tracking-[-0.04em]">No pudimos cargar esto</h1>
      <p className="text-pretty text-[15px] font-medium leading-[1.45] text-subtle">Lo volvemos a intentar solos en un momento.</p>
      {fallo && (
        <p role="alert" className="text-[13px] font-semibold text-destructive">
          {fallo}
        </p>
      )}
      <div className="mt-3 flex w-full flex-col gap-2.5">
        <button
          type="button"
          onClick={() => retry()}
          className="w-full rounded-full bg-primary py-[15px] font-heading text-sm font-extrabold text-primary-foreground"
        >
          Probar de nuevo
        </button>
        {dentroDeLaApp && (
          <>
            <button
              type="button"
              onClick={irAMiPerfil}
              disabled={pendiente}
              className="w-full rounded-full bg-card py-[15px] font-heading text-sm font-extrabold text-foreground shadow-item disabled:opacity-60"
            >
              {pendiente ? "Abriendo…" : "Ir a mi perfil"}
            </button>
            <FormCerrarSesion>
              <button type="submit" className="w-full py-3 text-sm font-bold text-slate-brand">
                Cerrar sesión
              </button>
            </FormCerrarSesion>
          </>
        )}
      </div>
    </main>
  );
}
