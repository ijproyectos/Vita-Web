"use client";

import { useActionState, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { VitaIcon } from "@/lib/vita-icons";
import { entrarConCodigoAction, type EstadoEntrarConCodigo } from "./actions";

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

// Deep link de entrada para quien ya tiene un código de vínculo (lo generó
// su cuidador desde /onboarding/vincular-cuidado) pero todavía no pasó por
// Google — no se puede saltear la autenticación, así que el link igual
// dispara el mismo signInWithOAuth, solo que apunta el `next` a la
// sub-vista de código de /onboarding/inicio en vez del onboarding normal.
const NEXT_CODIGO = "/onboarding/inicio?modo=codigo";

// Login por email/contraseña SOLO para pruebas automatizadas (TestSprite) —
// Google OAuth no se puede automatizar. Se activa con
// NEXT_PUBLIC_ENABLE_TEST_LOGIN=true en .env.local; Netlify no la define,
// así que en producción este bloque ni se renderiza.
const LOGIN_DE_PRUEBA = process.env.NEXT_PUBLIC_ENABLE_TEST_LOGIN === "true";

function LoginDePrueba({ next }: { next?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError("Email o contraseña incorrectos.");
      setCargando(false);
      return;
    }
    window.location.assign(next ?? "/app");
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-2 rounded-[20px] border border-dashed border-primary/40 p-3.5">
      <p className="text-xs font-semibold text-muted-foreground">Login de prueba (solo local)</p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <input
        type="email"
        name="email"
        aria-label="Email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="h-11 rounded-full bg-card px-4 text-sm shadow-outline-soft"
        required
      />
      <input
        type="password"
        name="password"
        aria-label="Contraseña"
        placeholder="Contraseña"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="h-11 rounded-full bg-card px-4 text-sm shadow-outline-soft"
        required
      />
      <button
        type="submit"
        disabled={cargando}
        className="h-11 rounded-full bg-primary text-sm font-bold text-primary-foreground disabled:opacity-60"
      >
        {cargando ? "Ingresando…" : "Ingresar"}
      </button>
    </form>
  );
}

const ESTADO_CODIGO_INICIAL: EstadoEntrarConCodigo = { status: "idle" };

// Entrada principal para quien no tiene cuenta de Google: el código de 6
// dígitos que le pasó su familiar (primer acceso o "entrar de nuevo").
function EntrarConCodigo() {
  const [abierto, setAbierto] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [estado, formAction, pendiente] = useActionState(entrarConCodigoAction, ESTADO_CODIGO_INICIAL);

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="flex h-14 w-full items-center justify-center gap-2.5 rounded-full font-heading text-[15px] font-bold text-primary-foreground"
        style={{ background: "linear-gradient(135deg, var(--brand-from), var(--brand-to))" }}
      >
        <VitaIcon name="link" size={18} />
        Me dio un código mi familiar
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-[20px] bg-card p-4 shadow-card">
      <label htmlFor="codigo-acceso" className="text-center text-sm font-semibold">
        Escribí el código de 6 dígitos
      </label>
      <input
        id="codigo-acceso"
        name="codigo"
        value={codigo}
        onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
        placeholder="000000"
        className="h-16 w-full rounded-[20px] bg-secondary text-center font-heading text-[26px] font-extrabold tracking-[0.3em] outline-none"
      />

      {estado.status === "error" && (
        <div role="alert" className="flex items-start gap-2.5 rounded-[16px] bg-destructive/10 px-3.5 py-3 text-sm text-destructive">
          <VitaIcon name="alert-triangle" size={18} className="mt-0.5 shrink-0" />
          <span>{estado.mensaje}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={codigo.length !== 6 || pendiente}
        className="h-14 w-full rounded-full font-heading text-[15px] font-bold text-primary-foreground transition-opacity disabled:opacity-55"
        style={{ background: "linear-gradient(135deg, var(--brand-from), var(--brand-to))" }}
      >
        {pendiente ? "Entrando…" : "Entrar"}
      </button>

      <button type="button" onClick={() => setAbierto(false)} className="self-center text-sm font-semibold text-muted-foreground">
        Volver
      </button>
    </form>
  );
}

export function LoginForm({ next }: { next?: string }) {
  const [loading, setLoading] = useState<"google" | "codigo" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function iniciarSesionGoogle(destino: string, origen: "google" | "codigo") {
    setError(null);
    setLoading(origen);
    const supabase = createClient();
    const callbackUrl = new URL("/auth/callback", window.location.origin);
    callbackUrl.searchParams.set("next", destino);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl.toString() },
    });
    if (error) {
      setError("No se pudo iniciar sesión con Google. Intentá de nuevo.");
      setLoading(null);
    }
    // On success the browser navigates away to Google, so no further
    // state update is needed here.
  }

  return (
    <div className="flex w-full flex-col gap-3">
      {error && (
        <p className="rounded-[14px] bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">{error}</p>
      )}

      <EntrarConCodigo />

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />o
        <span className="h-px flex-1 bg-border" />
      </div>

      <button
        type="button"
        onClick={() => iniciarSesionGoogle(next ?? "/app", "google")}
        disabled={loading !== null}
        className="flex h-14 w-full items-center justify-center gap-2.5 rounded-full bg-card font-heading text-[15px] font-bold text-foreground shadow-raised-outline disabled:opacity-60"
      >
        <GoogleLogo />
        {loading === "google" ? "Conectando…" : "Continuar con Google"}
      </button>

      <button
        type="button"
        onClick={() => iniciarSesionGoogle(NEXT_CODIGO, "codigo")}
        disabled={loading !== null}
        className="text-center text-sm font-semibold text-primary disabled:opacity-60"
      >
        {loading === "codigo" ? "Conectando…" : "Tengo Google y un código de mi familiar"}
      </button>

      {LOGIN_DE_PRUEBA && <LoginDePrueba next={next} />}
    </div>
  );
}
