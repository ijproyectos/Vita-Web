"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

function GoogleLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}

export function LoginForm({ next }: { next?: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGoogleLogin() {
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const callbackUrl = new URL("/auth/callback", window.location.origin);
    if (next) callbackUrl.searchParams.set("next", next);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl.toString() },
    });
    if (error) {
      setError("No se pudo iniciar sesión con Google. Intentá de nuevo.");
      setLoading(false);
    }
    // On success the browser navigates away to Google, so no further
    // state update is needed here.
  }

  return (
    <div className="flex w-full flex-col gap-3">
      {error && (
        <p className="rounded-[14px] bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">{error}</p>
      )}

      <button
        type="button"
        onClick={handleGoogleLogin}
        disabled={loading}
        className="flex h-14 w-full items-center justify-center gap-2.5 rounded-full bg-white font-heading text-[15px] font-bold text-foreground shadow-[0_2px_10px_rgba(15,33,54,0.06),inset_0_0_0_1px_rgba(15,33,54,0.06)] disabled:opacity-60"
      >
        <GoogleLogo />
        {loading ? "Conectando…" : "Continuar con Google"}
      </button>
    </div>
  );
}
