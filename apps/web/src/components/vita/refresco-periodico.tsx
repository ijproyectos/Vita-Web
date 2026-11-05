"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const INTERVALO_REFRESCO_MS = 45_000;

/** Vuelve a pedir al servidor los datos de la pantalla mientras está abierta (tomas de hoy). */
export function useRefrescoPeriodico() {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), INTERVALO_REFRESCO_MS);
    return () => clearInterval(id);
  }, [router]);
}

/** Lo mismo para pantallas de servidor, que no pueden usar el hook. */
export function RefrescoPeriodico() {
  useRefrescoPeriodico();
  return null;
}
