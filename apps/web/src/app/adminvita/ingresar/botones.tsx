"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Entrar con Google y volver al panel. Con una sesión que no es admin, primero se cierra esa sesión y se le pide a
// Google que muestre el selector de cuentas, para poder elegir la de administración.
export function BotonesIngreso({ conSesion }: { conSesion: boolean }) {
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function entrarConGoogle() {
    setError(null);
    setCargando(true);
    const supabase = createClient();
    if (conSesion) await supabase.auth.signOut({ scope: "local" });
    const vuelta = new URL("/auth/callback", window.location.origin);
    vuelta.searchParams.set("next", "/adminvita");
    const { error: errorOAuth } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: vuelta.toString(), queryParams: { prompt: "select_account" } },
    });
    if (errorOAuth) {
      setError("No se pudo iniciar sesión con Google. Probá de nuevo.");
      setCargando(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={entrarConGoogle}
        disabled={cargando}
        className="flex w-full items-center justify-center gap-2.5 rounded-full bg-ink py-3.5 text-[15px] font-extrabold text-on-ink transition-transform active:scale-[0.98] disabled:opacity-60 motion-reduce:transition-none"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/google-g.svg" alt="" width={18} height={18} />
        {cargando ? "Abriendo Google…" : conSesion ? "Entrar con otra cuenta de Google" : "Entrar con Google"}
      </button>
      {error ? (
        <p role="alert" className="text-center text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
