"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { VitaIcon } from "@/lib/vita-icons";

type Vista = "cerrado" | "entrar" | "crear" | "olvide" | "enviado";

const MIN_PASSWORD = 8;

// Errores de Supabase Auth → castellano. Se matchea por `code` cuando existe
// y por el mensaje como respaldo (versiones viejas no siempre traen code).
function mensajeDeError(error: { code?: string; message?: string; status?: number }): string {
  const code = error.code ?? "";
  const msg = (error.message ?? "").toLowerCase();
  if (code === "invalid_credentials" || msg.includes("invalid login credentials")) return "Email o contraseña incorrectos.";
  if (code === "email_not_confirmed" || msg.includes("email not confirmed")) return "Todavía no confirmaste tu email. Revisá tu casilla.";
  if (code === "user_already_exists" || msg.includes("already registered")) return "Ya hay una cuenta con ese email. Probá iniciar sesión.";
  if (code === "weak_password" || msg.includes("password")) return `La contraseña tiene que tener al menos ${MIN_PASSWORD} caracteres.`;
  if (code.includes("rate_limit") || error.status === 429) return "Hicimos muchos intentos seguidos. Esperá unos minutos y probá de nuevo.";
  return "No pudimos completar el pedido. Probá de nuevo en un rato.";
}

function urlCallback(next: string): string {
  const u = new URL("/auth/callback", window.location.origin);
  u.searchParams.set("next", next);
  return u.toString();
}

const INPUT = "h-12 w-full rounded-full bg-secondary px-4 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-ring";
const BOTON =
  "h-14 w-full rounded-full font-heading text-[15px] font-bold text-primary-foreground transition-opacity disabled:opacity-55";
const FONDO_BOTON = { background: "linear-gradient(135deg, var(--brand-from), var(--brand-to))" };

// Entrada con email y contraseña (V7 Onboarding: Iniciar sesión / Crear
// cuenta / Olvidé mi contraseña). Llamadas directas al cliente de Supabase,
// igual que el login con Google: no hay nada que validar en el servidor
// antes de que Supabase Auth responda. Nunca lanza.
export function EntrarConEmail({ next }: { next?: string }) {
  const [vista, setVista] = useState<Vista>("cerrado");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [puedeReenviar, setPuedeReenviar] = useState(false);

  function ir(v: Vista) {
    setVista(v);
    setError(null);
    setAviso(null);
  }

  async function ejecutar(fn: () => Promise<void>) {
    setError(null);
    setCargando(true);
    try {
      await fn();
    } catch {
      setError("No pudimos conectarnos. Revisá tu conexión y probá de nuevo.");
    } finally {
      setCargando(false);
    }
  }

  function entrar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void ejecutar(async () => {
      const { error } = await createClient().auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        setError(mensajeDeError(error));
        setPuedeReenviar(error.code === "email_not_confirmed");
        return;
      }
      window.location.assign(next ?? "/app");
    });
  }

  function crear(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (password.length < MIN_PASSWORD) return setError(`La contraseña tiene que tener al menos ${MIN_PASSWORD} caracteres.`);
    if (password !== confirmacion) return setError("Las contraseñas no coinciden.");
    void ejecutar(async () => {
      const { error } = await createClient().auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: urlCallback("/onboarding/inicio") },
      });
      if (error) return setError(mensajeDeError(error));
      setAviso(`Te mandamos un mail a ${email.trim()} para confirmar tu cuenta. Abrilo desde este celular.`);
      setPuedeReenviar(true);
      setVista("enviado");
    });
  }

  function olvide(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void ejecutar(async () => {
      const { error } = await createClient().auth.resetPasswordForEmail(email.trim(), {
        redirectTo: urlCallback("/auth/nueva-contrasena"),
      });
      if (error) return setError(mensajeDeError(error));
      // Mismo mensaje exista o no la cuenta: no se revela qué emails están registrados.
      setAviso(`Si hay una cuenta con ${email.trim()}, te llegó un mail para elegir una contraseña nueva.`);
      setPuedeReenviar(false);
      setVista("enviado");
    });
  }

  function reenviar() {
    void ejecutar(async () => {
      const { error } = await createClient().auth.resend({
        type: "signup",
        email: email.trim(),
        options: { emailRedirectTo: urlCallback("/onboarding/inicio") },
      });
      if (error) return setError(mensajeDeError(error));
      setAviso(`Te lo mandamos de nuevo a ${email.trim()}.`);
    });
  }

  if (vista === "cerrado") {
    return (
      <button
        type="button"
        onClick={() => ir("entrar")}
        className="flex h-14 w-full items-center justify-center gap-2.5 rounded-full bg-card font-heading text-[15px] font-bold text-foreground shadow-raised-outline"
      >
        <VitaIcon name="mail" size={18} />
        Continuar con email
      </button>
    );
  }

  const titulo = { entrar: "Iniciar sesión", crear: "Crear cuenta", olvide: "Olvidé mi contraseña", enviado: "Revisá tu mail" }[vista];

  return (
    <div className="flex flex-col gap-3 rounded-[20px] bg-card p-4 shadow-card">
      <div className="text-center font-heading text-[17px] font-extrabold tracking-[-0.02em]">{titulo}</div>

      {vista === "enviado" ? (
        <>
          {aviso && <p className="text-center text-sm text-slate-brand">{aviso}</p>}
          {puedeReenviar && (
            <button type="button" onClick={reenviar} disabled={cargando} className="text-sm font-semibold text-primary disabled:opacity-60">
              {cargando ? "Enviando…" : "Reenviar el mail"}
            </button>
          )}
        </>
      ) : (
        <form onSubmit={vista === "entrar" ? entrar : vista === "crear" ? crear : olvide} className="flex flex-col gap-2.5">
          <input
            type="email"
            name="email"
            aria-label="Tu email"
            placeholder="tu@email.com"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={INPUT}
            required
          />
          {vista !== "olvide" && (
            <input
              type="password"
              name="password"
              aria-label="Tu contraseña"
              placeholder="Contraseña"
              autoComplete={vista === "crear" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={INPUT}
              required
            />
          )}
          {vista === "crear" && (
            <input
              type="password"
              name="confirmacion"
              aria-label="Repetí la contraseña"
              placeholder="Repetí la contraseña"
              autoComplete="new-password"
              value={confirmacion}
              onChange={(e) => setConfirmacion(e.target.value)}
              className={INPUT}
              required
            />
          )}
          <button type="submit" disabled={cargando} className={BOTON} style={FONDO_BOTON}>
            {cargando
              ? "Un momento…"
              : vista === "entrar"
                ? "Entrar"
                : vista === "crear"
                  ? "Crear cuenta"
                  : "Mandarme el mail"}
          </button>
        </form>
      )}

      {error && (
        <div role="alert" className="flex items-start gap-2.5 rounded-[16px] bg-destructive/10 px-3.5 py-3 text-sm text-destructive">
          <VitaIcon name="alert-triangle" size={18} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {error && puedeReenviar && vista === "entrar" && (
        <button type="button" onClick={reenviar} disabled={cargando} className="text-sm font-semibold text-primary">
          Reenviar el mail de confirmación
        </button>
      )}

      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm font-semibold">
        {vista !== "entrar" && (
          <button type="button" onClick={() => ir("entrar")} className="text-primary">
            Ya tengo cuenta
          </button>
        )}
        {vista !== "crear" && (
          <button type="button" onClick={() => ir("crear")} className="text-primary">
            Crear cuenta
          </button>
        )}
        {vista === "entrar" && (
          <button type="button" onClick={() => ir("olvide")} className="text-slate-brand">
            Olvidé mi contraseña
          </button>
        )}
        <button type="button" onClick={() => ir("cerrado")} className="text-slate-brand">
          Volver
        </button>
      </div>
    </div>
  );
}
