"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { VitaAvatar } from "@/components/vita/vita-avatar";
import {
  AvisoAuth,
  BotonCta,
  BotonPildora,
  BotonVolver,
  CampoAuth,
  CampoPassword,
  CodigoSeisCajas,
  IconoPegar,
  IconoReenviar,
  PantallaAuth,
  ReglasPassword,
  TituloAuth,
  leerCodigoPortapapeles,
  passwordValida,
} from "@/components/vita/auth-ui";
import { entrarConCodigoAction } from "./actions";

// Acceso V7 (Onboarding.dc.html): bienvenida, iniciar sesión, crear cuenta,
// olvidé mi contraseña, revisá tu mail e ingresá tu código — todo en una sola
// ruta (/login), con vistas internas. Las llamadas de email/contraseña van
// directo al cliente de Supabase (no hay nada que validar en el servidor antes
// de que Supabase Auth responda); el código de 6 dígitos usa
// entrarConCodigoAction. Nada de esto lanza.

type Vista = "bienvenida" | "entrar" | "crear" | "olvide" | "enviado" | "codigo";

const MIN_PASSWORD = 8;

// Errores de Supabase Auth → castellano. Se matchea por `code` cuando existe
// y por el mensaje como respaldo (versiones viejas no siempre traen code).
function mensajeDeError(error: { code?: string; message?: string; status?: number }): string {
  const code = error.code ?? "";
  const msg = (error.message ?? "").toLowerCase();
  if (code === "invalid_credentials" || msg.includes("invalid login credentials"))
    return "El email o la contraseña no coinciden. Probá de nuevo o recuperá tu contraseña.";
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

// Destino tras confirmar el mail / entrar: el primer paso del onboarding es
// "¿Cómo vas a usar Vita?" (el layout de /app redirige igual si falta).
const DESTINO_ONBOARDING = "/onboarding/para-quien";

// Deep link para quien ya tiene un código de vínculo pero entra con Google:
// el callback lo deja en la sub-vista de código de /onboarding/inicio.
const NEXT_CODIGO = "/onboarding/inicio?modo=codigo";

// Login por email/contraseña SOLO para pruebas automatizadas (TestSprite) —
// Google OAuth no se puede automatizar. Se activa con
// NEXT_PUBLIC_ENABLE_TEST_LOGIN=true en .env.local; Netlify no la define,
// así que en producción este bloque ni se renderiza.
const LOGIN_DE_PRUEBA = process.env.NEXT_PUBLIC_ENABLE_TEST_LOGIN === "true";

// Apple (V7 Bienvenida): preparado pero apagado. Requiere una cuenta paga de
// Apple Developer y configurar el provider "apple" en Supabase Auth; recién
// ahí se activa con NEXT_PUBLIC_ENABLE_APPLE_LOGIN=true.
const LOGIN_APPLE = process.env.NEXT_PUBLIC_ENABLE_APPLE_LOGIN === "true";

// Logo de marca de Google: sus colores son fijos (no son tokens), por eso
// vive como SVG estático en /public, igual que icon.svg.
function GoogleLogo() {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/google-g.svg" alt="" width={19} height={19} aria-hidden="true" />;
}

function AppleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.37 12.6c-.02-2.2 1.8-3.26 1.88-3.31-1.03-1.5-2.62-1.7-3.19-1.73-1.36-.14-2.65.8-3.34.8-.69 0-1.75-.78-2.88-.76-1.48.02-2.85.86-3.61 2.19-1.54 2.67-.39 6.62 1.11 8.79.73 1.06 1.6 2.25 2.75 2.21 1.1-.04 1.52-.71 2.85-.71 1.33 0 1.71.71 2.88.69 1.19-.02 1.94-1.08 2.67-2.14.84-1.23 1.19-2.42 1.21-2.48-.03-.01-2.32-.89-2.33-3.55zM14.18 6.13c.61-.74 1.02-1.76.91-2.78-.88.04-1.94.59-2.57 1.32-.56.65-1.06 1.69-.93 2.69.98.08 1.98-.5 2.59-1.23z" />
    </svg>
  );
}

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
    <form onSubmit={enviar} className="mt-8 flex flex-col gap-2 rounded-[20px] border border-dashed border-teal-line p-3.5">
      <p className="text-xs font-semibold text-subtle">Login de prueba (solo local)</p>
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
      <button type="submit" disabled={cargando} className="h-11 rounded-full bg-primary text-sm font-bold text-primary-foreground disabled:opacity-60">
        {cargando ? "Ingresando…" : "Ingresar"}
      </button>
    </form>
  );
}

export function LoginForm({ next, cuentaEliminada }: { next?: string; cuentaEliminada?: boolean }) {
  const [vista, setVista] = useState<Vista>("bienvenida");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nombre, setNombre] = useState("");
  const [cargando, setCargando] = useState<"google" | "apple" | "codigo" | "email" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [motivoEnviado, setMotivoEnviado] = useState<"crear" | "olvide">("crear");
  const [puedeReenviar, setPuedeReenviar] = useState(false);
  // Código de 6 dígitos (login de quien no tiene Google).
  const [codigo, setCodigo] = useState("");
  const [errorCodigo, setErrorCodigo] = useState<string | null>(null);
  const [enviandoCodigo, startCodigo] = useTransition();

  function ir(v: Vista) {
    setVista(v);
    setError(null);
    setAviso(null);
    setErrorCodigo(null);
  }

  async function ejecutar(fn: () => Promise<void>) {
    setError(null);
    setCargando("email");
    try {
      await fn();
    } catch {
      setError("No pudimos conectarnos. Revisá tu conexión y probá de nuevo.");
    } finally {
      setCargando(null);
    }
  }

  async function iniciarSesionOAuth(destino: string, origen: "google" | "codigo" | "apple") {
    setError(null);
    setCargando(origen);
    const { error } = await createClient().auth.signInWithOAuth({
      provider: origen === "apple" ? "apple" : "google",
      options: { redirectTo: urlCallback(destino) },
    });
    if (error) {
      setError(`No se pudo iniciar sesión con ${origen === "apple" ? "Apple" : "Google"}. Intentá de nuevo.`);
      setCargando(null);
    }
    // Si sale bien el navegador se va a Google: no hay más estado que actualizar.
  }

  function entrar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email.trim() || !password) return;
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

  const crearOk = passwordValida(password) && email.trim() !== "" && nombre.trim() !== "";

  function crear(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!crearOk) return;
    void ejecutar(async () => {
      const { error } = await createClient().auth.signUp({
        email: email.trim(),
        password,
        // El nombre viaja en user_metadata: /auth/callback lo copia a
        // perfiles.nombre al confirmar, y el onboarding lo usa en el saludo.
        options: { emailRedirectTo: urlCallback(DESTINO_ONBOARDING), data: { full_name: nombre.trim() } },
      });
      if (error) return setError(mensajeDeError(error));
      setAviso(`Te mandamos un mail a ${email.trim()} para confirmar tu cuenta. Abrilo desde este celular.`);
      setMotivoEnviado("crear");
      setPuedeReenviar(true);
      setVista("enviado");
    });
  }

  function olvide(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email.trim()) return;
    void ejecutar(async () => {
      const { error } = await createClient().auth.resetPasswordForEmail(email.trim(), {
        redirectTo: urlCallback("/auth/nueva-contrasena"),
      });
      if (error) return setError(mensajeDeError(error));
      // Mismo mensaje exista o no la cuenta: no se revela qué emails están registrados.
      setAviso(`Si hay una cuenta con ${email.trim()}, te llegó un mail para elegir una contraseña nueva.`);
      setMotivoEnviado("olvide");
      setPuedeReenviar(true);
      setVista("enviado");
    });
  }

  function reenviar() {
    void ejecutar(async () => {
      const supabase = createClient();
      const { error } =
        motivoEnviado === "olvide"
          ? await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: urlCallback("/auth/nueva-contrasena") })
          : await supabase.auth.resend({
              type: "signup",
              email: email.trim(),
              options: { emailRedirectTo: urlCallback(DESTINO_ONBOARDING) },
            });
      if (error) return setError(mensajeDeError(error));
      setAviso(`Te lo mandamos de nuevo a ${email.trim()}.`);
    });
  }

  // Código de 6 dígitos: se manda solo al completar la sexta cifra.
  function cambiarCodigo(v: string) {
    setCodigo(v);
    setErrorCodigo(null);
    if (v.length === 6) {
      const fd = new FormData();
      fd.set("codigo", v);
      startCodigo(async () => {
        const r = await entrarConCodigoAction({ status: "idle" }, fd);
        if (r.status === "error") {
          setErrorCodigo(r.mensaje);
          setCodigo("");
        }
      });
    }
  }

  async function pegarCodigo() {
    const pegado = await leerCodigoPortapapeles();
    if (pegado) cambiarCodigo(pegado);
  }

  // ───────────────────────── Bienvenida ─────────────────────────
  if (vista === "bienvenida") {
    return (
      <PantallaAuth className="pt-14">
        <div className="flex flex-1 flex-col items-center justify-center">
          <div className="flex size-[168px] items-center justify-center overflow-hidden rounded-full bg-avatar-fondo">
            <VitaAvatar size={150} estado="happy" />
          </div>
          <div className="mt-[22px] font-heading text-[30px] font-extrabold leading-none tracking-[-0.06em]">
            vi<span className="text-primary">ta</span>
          </div>
          <h1 className="mt-5 text-balance text-center font-heading text-[26px] font-extrabold leading-[1.15] tracking-[-0.04em]">
            Tu salud y la de tu familia, en un solo lugar.
          </h1>
          <p className="mt-2.5 text-pretty text-center text-[15px] font-medium leading-normal text-slate-brand">
            Remedios, turnos y controles. Vita te acompaña.
          </p>
          {cuentaEliminada && (
            <p role="status" className="mt-5 rounded-[16px] bg-card px-4 py-3 text-center text-sm font-semibold shadow-card">
              Tu cuenta y todos tus datos fueron eliminados.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={() => iniciarSesionOAuth(next ?? "/app", "google")}
            disabled={cargando !== null}
            className="flex h-[54px] items-center justify-center gap-2.5 rounded-full border border-line bg-card font-heading text-[15.5px] font-bold transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            <GoogleLogo />
            {cargando === "google" ? "Conectando…" : "Continuar con Google"}
          </button>
          {LOGIN_APPLE && (
            <button
              type="button"
              onClick={() => iniciarSesionOAuth(next ?? "/app", "apple")}
              disabled={cargando !== null}
              className="flex h-[54px] items-center justify-center gap-2.5 rounded-full bg-foreground font-heading text-[15.5px] font-bold text-background transition-transform active:scale-[0.98] disabled:opacity-60"
            >
              <AppleLogo />
              {cargando === "apple" ? "Conectando…" : "Continuar con Apple"}
            </button>
          )}
          <button type="button" onClick={() => ir("entrar")} className="h-11 text-[14.5px] font-bold text-slate-brand">
            Continuar con email
          </button>
        </div>
        {error && <AvisoAuth>{error}</AvisoAuth>}
        <div className="mb-4 mt-1.5 h-px bg-line-cream" />
        <div className="text-center text-sm font-medium text-slate-brand">
          ¿Te invitaron?{" "}
          <button type="button" onClick={() => ir("codigo")} className="font-extrabold text-teal-deep">
            Tengo un código
          </button>
        </div>

        {LOGIN_DE_PRUEBA && <LoginDePrueba next={next} />}
      </PantallaAuth>
    );
  }

  // ───────────────────────── Ingresá tu código ─────────────────────────
  if (vista === "codigo") {
    return (
      <PantallaAuth>
        <BotonVolver onClick={() => ir("bienvenida")} />
        <TituloAuth
          titulo="Ingresá tu código"
          sub="Te lo mandó alguien de tu familia por WhatsApp. Sirve para conectar tu celular o para ayudar a cuidar a alguien."
        />
        <form onSubmit={(e) => e.preventDefault()}>
          <CodigoSeisCajas valor={codigo} onChange={cambiarCodigo} autoFocus disabled={enviandoCodigo} />
        </form>
        {errorCodigo && <AvisoAuth>{errorCodigo}</AvisoAuth>}
        <BotonPildora onClick={pegarCodigo} disabled={enviandoCodigo}>
          <IconoPegar />
          {enviandoCodigo ? "Entrando…" : "Pegar código"}
        </BotonPildora>
        <div className="flex-1" />
        {error && <AvisoAuth>{error}</AvisoAuth>}
        <button
          type="button"
          onClick={() => iniciarSesionOAuth(NEXT_CODIGO, "codigo")}
          disabled={cargando !== null}
          className="mt-4 text-center text-sm font-bold text-teal-deep disabled:opacity-60"
        >
          {cargando === "codigo" ? "Conectando…" : "Tengo Google y un código de mi familiar"}
        </button>
        <p className="mt-3 text-balance text-center text-sm font-medium leading-normal text-subtle">
          Si abriste el link de WhatsApp, entrás directo.
        </p>
      </PantallaAuth>
    );
  }

  // ───────────────────────── Revisá tu mail ─────────────────────────
  if (vista === "enviado") {
    return (
      <PantallaAuth>
        <BotonVolver onClick={() => ir(motivoEnviado === "crear" ? "crear" : "olvide")} />
        <TituloAuth titulo="Revisá tu mail" sub={aviso} />
        {error && <AvisoAuth>{error}</AvisoAuth>}
        {puedeReenviar && (
          <BotonPildora onClick={reenviar} disabled={cargando !== null}>
            <IconoReenviar />
            {cargando === "email" ? "Enviando…" : "Reenviar mail"}
          </BotonPildora>
        )}
        <div className="flex-1" />
        <p className="text-balance text-center text-sm font-medium leading-normal text-subtle">
          Si no lo ves, mirá en Spam o Promociones.
        </p>
      </PantallaAuth>
    );
  }

  // ───────────────────────── Olvidé mi contraseña ─────────────────────────
  if (vista === "olvide") {
    return (
      <PantallaAuth>
        <form onSubmit={olvide} className="flex flex-1 flex-col">
          <BotonVolver onClick={() => ir("entrar")} />
          <TituloAuth titulo="¿Olvidaste tu contraseña?" sub="Escribí tu email y te mandamos un link para crear una nueva." />
          <div className="mt-[26px]">
            <CampoAuth
              etiqueta="Email"
              type="email"
              name="email"
              placeholder="tu@email.com"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          {error && <AvisoAuth>{error}</AvisoAuth>}
          <div className="flex-1" />
          <BotonCta type="submit" habilitado={email.trim() !== ""} disabled={cargando !== null}>
            {cargando === "email" ? "Un momento…" : "Mandar link"}
          </BotonCta>
        </form>
      </PantallaAuth>
    );
  }

  // ───────────────────────── Crear cuenta ─────────────────────────
  if (vista === "crear") {
    return (
      <PantallaAuth>
        <form onSubmit={crear} className="flex flex-1 flex-col">
          <BotonVolver onClick={() => ir("entrar")} />
          <TituloAuth titulo="Creá tu cuenta" sub="Con tu email. Después te ayudo a armar todo." />
          <div className="mt-[26px] flex flex-col gap-3.5">
            <CampoAuth
              etiqueta="Nombre"
              type="text"
              name="nombre"
              placeholder="Tu nombre"
              autoComplete="given-name"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
            />
            <CampoAuth
              etiqueta="Email"
              type="email"
              name="email"
              placeholder="tu@email.com"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <CampoPassword
              etiqueta="Contraseña"
              name="password"
              placeholder="8 o más, con número y símbolo"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div className="mt-4">
            <ReglasPassword password={password} />
          </div>
          {error && <AvisoAuth>{error}</AvisoAuth>}
          <div className="flex-1" />
          <BotonCta type="submit" grande habilitado={crearOk} disabled={cargando !== null}>
            {cargando === "email" ? "Un momento…" : "Crear cuenta"}
          </BotonCta>
          <div className="mt-4 text-center text-sm font-medium text-slate-brand">
            ¿Ya tenés cuenta?{" "}
            <button type="button" onClick={() => ir("entrar")} className="font-extrabold text-teal-deep">
              Entrar
            </button>
          </div>
          <p className="mt-3 text-balance text-center text-[12.5px] font-medium leading-normal text-subtle">
            Al crear tu cuenta aceptás los{" "}
            <Link href="/legal/terminos" className="underline underline-offset-2">
              términos
            </Link>{" "}
            y la{" "}
            <Link href="/legal/privacidad" className="underline underline-offset-2">
              política de privacidad
            </Link>{" "}
            de Vita.
          </p>
        </form>
      </PantallaAuth>
    );
  }

  // ───────────────────────── Iniciar sesión ─────────────────────────
  return (
    <PantallaAuth>
      <form onSubmit={entrar} className="flex flex-1 flex-col">
        <BotonVolver onClick={() => ir("bienvenida")} />
        <TituloAuth titulo="Entrá a tu cuenta" sub="Con el email y la contraseña que usaste al crearla." />
        <div className="mt-[26px] flex flex-col gap-3.5">
          <CampoAuth
            etiqueta="Email"
            type="email"
            name="email"
            placeholder="tu@email.com"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <CampoPassword
            etiqueta="Contraseña"
            name="password"
            placeholder="Tu contraseña"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <button type="button" onClick={() => ir("olvide")} className="mt-3.5 self-end p-1 text-[15px] font-bold text-teal-deep">
          ¿Olvidaste tu contraseña?
        </button>
        {error && (
          <AvisoAuth>
            {error}
            {puedeReenviar && (
              <button type="button" onClick={reenviar} disabled={cargando !== null} className="mt-2 block font-extrabold underline">
                Reenviar el mail de confirmación
              </button>
            )}
          </AvisoAuth>
        )}
        {aviso && !error && <AvisoAuth role="status">{aviso}</AvisoAuth>}
        <div className="flex-1" />
        <BotonCta type="submit" habilitado={email.trim() !== "" && password !== ""} disabled={cargando !== null}>
          {cargando === "email" ? "Entrando…" : "Entrar"}
        </BotonCta>
        <div className="mt-4 text-center text-sm font-medium text-slate-brand">
          ¿No tenés cuenta?{" "}
          <button type="button" onClick={() => ir("crear")} className="font-extrabold text-teal-deep">
            Crear cuenta
          </button>
        </div>
      </form>
    </PantallaAuth>
  );
}
