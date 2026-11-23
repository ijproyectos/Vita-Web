"use client";

import { useEffect, useState } from "react";
import { iniciarSesionNativo, plataformaNativa } from "./login-nativo";
import { proveedoresDisponibles, type Plataforma, type Proveedor, type ProveedorDisponible } from "./login-nativo-logica";

/**
 * Native login state for the login screens. `plataforma` is resolved after
 * mount so SSR and the first client render match (plain web renders exactly as
 * before); `proveedores` is the web default until the native shell is detected.
 */
export function useLoginNativo() {
  const [plataforma, setPlataforma] = useState<Plataforma | null>(null);
  const [enCurso, setEnCurso] = useState<Proveedor | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Native detection is only possible on the client after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlataforma(plataformaNativa());
  }, []);

  const proveedores: ProveedorDisponible[] = proveedoresDisponibles(plataforma);
  const via = (p: Proveedor) => proveedores.find((x) => x.proveedor === p)?.via ?? null;

  /** Opens the native sheet; on success goes through `/auth/continuar` (same post-login as the OAuth callback). */
  async function iniciar(proveedor: Proveedor, destino: string) {
    setError(null);
    setEnCurso(proveedor);
    const r = await iniciarSesionNativo(proveedor);
    if (r.ok) {
      // Full navigation on purpose: it hits a Route Handler that sets cookies.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`/auth/continuar?next=${encodeURIComponent(destino)}`);
      return; // keep the loading state while navigating
    }
    setEnCurso(null);
    if (r.motivo !== "cancelado") setError(r.mensaje);
  }

  return { plataforma, proveedores, via, enCurso, error, iniciar };
}
