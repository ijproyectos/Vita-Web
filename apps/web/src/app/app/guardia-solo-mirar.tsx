"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { rutaPermitidaSoloMirar } from "@/lib/familia/solo-mirar";

// Un Lector que mira a otra persona solo recorre las pantallas de
// `rutaPermitidaSoloMirar`; cualquier otra lo devuelve al inicio. Es solo
// navegación (el layout del servidor no conoce el pathname): la RLS y las
// acciones siguen protegiendo los datos. No renderiza nada.
export function GuardiaSoloMirar({ activa }: { activa: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const bloqueada = activa && !rutaPermitidaSoloMirar(pathname);

  useEffect(() => {
    if (bloqueada) router.replace("/app");
  }, [bloqueada, router]);

  return null;
}
