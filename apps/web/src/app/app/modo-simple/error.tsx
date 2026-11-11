"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { olvidarModoSimple } from "@/lib/modo-simple/recordar";

/**
 * Fallback if the simple mode screen fails to render. `/app` redirects here while the
 * remembered-mode cookie exists, so without a way out a render error would trap the
 * person on this page. This is only the failure exit, not a regular "leave" entry point.
 */
export default function ErrorModoSimple({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const router = useRouter();

  useEffect(() => {
    console.error(error);
  }, [error]);

  // Casi siempre es un corte de internet: se reintenta solo al volver la red y
  // cada 30 s, así nadie tiene que tocar nada (y menos salir del modo simple).
  useEffect(() => {
    const reintentar = () => retry();
    const t = setInterval(reintentar, 30_000);
    window.addEventListener("online", reintentar);
    return () => {
      clearInterval(t);
      window.removeEventListener("online", reintentar);
    };
  }, [retry]);

  // Salida explícita y chica: antes decía "Ir al inicio", sonaba inofensivo y
  // apagaba el modo simple para siempre en ese celular.
  function salirDelModoSimple() {
    olvidarModoSimple();
    // Refresh so /app is re-evaluated server-side with the cookie already cleared.
    router.replace("/app");
    router.refresh();
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-canvas px-6 text-center">
      <h1 className="text-[32px] font-extrabold leading-tight text-foreground">Algo no anduvo bien</h1>
      <div className="flex w-full max-w-sm flex-col gap-3">
        <button
          type="button"
          onClick={() => retry()}
          className="flex h-[76px] w-full items-center justify-center rounded-full bg-teal-deep text-[24px] font-extrabold text-primary-foreground shadow-card transition-transform active:scale-[0.98] motion-reduce:transition-none"
        >
          Probar de nuevo
        </button>
        <button
          type="button"
          onClick={salirDelModoSimple}
          className="mt-4 min-h-12 text-[15px] font-semibold text-subtle underline underline-offset-4"
        >
          Salir del modo simple
        </button>
      </div>
    </main>
  );
}
