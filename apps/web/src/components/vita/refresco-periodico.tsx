"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { programarRefresco } from "@/lib/navegacion/refresco";

/** Vuelve a pedir al servidor los datos de la pantalla mientras está abierta (tomas de hoy). */
export function useRefrescoPeriodico() {
  const router = useRouter();
  useEffect(() => programarRefresco(() => router.refresh()), [router]);
}

/** Lo mismo para pantallas de servidor, que no pueden usar el hook. */
export function RefrescoPeriodico() {
  useRefrescoPeriodico();
  return null;
}
