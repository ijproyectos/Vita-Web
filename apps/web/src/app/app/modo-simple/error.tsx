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

  function irAlInicio() {
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
          onClick={irAlInicio}
          className="flex h-[64px] w-full items-center justify-center rounded-full bg-card text-[20px] font-bold text-teal-deep shadow-card transition-transform active:scale-[0.98] motion-reduce:transition-none"
        >
          Ir al inicio
        </button>
      </div>
    </main>
  );
}
