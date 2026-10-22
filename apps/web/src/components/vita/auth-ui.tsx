"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

// Piezas compartidas de las pantallas de acceso V7 (Onboarding.dc.html:
// bienvenida, iniciar sesión, crear cuenta, olvidé mi contraseña, ingresá
// tu código, contraseña nueva). Todo el color sale de tokens.

const ICONO = { fill: "none", strokeLinecap: "round", strokeLinejoin: "round" } as const;

export function IconoVolver() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2" aria-hidden="true" {...ICONO}>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

export function IconoTilde({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3.4" aria-hidden="true" {...ICONO}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export function IconoReenviar() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true" {...ICONO}>
      <path d="M20 11a8 8 0 1 0-2.3 5.7" />
      <path d="M20 5v6h-6" />
    </svg>
  );
}

export function IconoPegar() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true" {...ICONO}>
      <rect x="8" y="3" width="8" height="4" rx="1.5" />
      <path d="M16 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2" />
    </svg>
  );
}

/** Pantalla de acceso sobre crema, con padding de la maqueta (62/24/40). */
export function PantallaAuth({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("mx-auto flex min-h-dvh w-full max-w-md flex-col bg-cream px-6 pb-10 pt-16", className)}>{children}</div>
  );
}

export function BotonVolver({ onClick, href }: { onClick?: () => void; href?: string }) {
  const clases =
    "flex size-12 shrink-0 items-center justify-center rounded-full bg-card text-foreground shadow-card transition-transform active:scale-[0.94]";
  if (href) {
    return (
      <Link href={href} aria-label="Volver" className={clases}>
        <IconoVolver />
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} aria-label="Volver" className={clases}>
      <IconoVolver />
    </button>
  );
}

export function TituloAuth({ titulo, sub }: { titulo: ReactNode; sub?: ReactNode }) {
  return (
    <>
      <h1 className="mt-[30px] text-pretty font-heading text-[30px] font-extrabold leading-[1.12] tracking-[-0.04em]">{titulo}</h1>
      {sub && <p className="mt-2.5 text-pretty text-[17px] font-medium leading-[1.45] text-slate-brand">{sub}</p>}
    </>
  );
}

const ETIQUETA = "pl-1 text-[10.5px] font-bold uppercase tracking-[0.16em] text-subtle";
const ARO = "shadow-[0_0_0_1px_var(--line)] focus-within:shadow-[0_0_0_2px_var(--primary)]";

export function CampoAuth({
  etiqueta,
  ...props
}: { etiqueta: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-[7px]">
      <span className={ETIQUETA}>{etiqueta}</span>
      <input
        {...props}
        className={cn(
          "w-full rounded-full border-none bg-card px-5 py-4 text-base font-semibold outline-none placeholder:font-semibold placeholder:text-faint",
          ARO
        )}
      />
    </label>
  );
}

export function CampoPassword({
  etiqueta,
  ...props
}: { etiqueta: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [ver, setVer] = useState(false);
  return (
    <label className="flex flex-col gap-[7px]">
      <span className={ETIQUETA}>{etiqueta}</span>
      <div className={cn("flex items-center rounded-full bg-card pr-1.5", ARO)}>
        <input
          {...props}
          type={ver ? "text" : "password"}
          className="min-w-0 flex-1 border-none bg-transparent py-4 pl-5 text-base font-semibold outline-none placeholder:font-semibold placeholder:text-faint"
        />
        <button
          type="button"
          onClick={() => setVer((v) => !v)}
          className="select-none rounded-full px-3.5 py-2.5 text-[13.5px] font-bold text-teal-deep"
        >
          {ver ? "Ocultar" : "Ver"}
        </button>
      </div>
    </label>
  );
}

export const REGLAS_PASSWORD = {
  largo: (p: string) => p.length >= 8,
  numero: (p: string) => /\d/.test(p),
  simbolo: (p: string) => /[^A-Za-z0-9\s]/.test(p),
};

export function passwordValida(p: string): boolean {
  return REGLAS_PASSWORD.largo(p) && REGLAS_PASSWORD.numero(p) && REGLAS_PASSWORD.simbolo(p);
}

function Regla({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <div className={cn("flex items-center gap-2.5 px-1 text-[15px] font-semibold", ok ? "text-foreground" : "text-subtle")}>
      <span
        className={cn(
          "flex size-[22px] shrink-0 items-center justify-center rounded-full text-primary-foreground transition-colors",
          ok ? "bg-primary" : "bg-line-strong"
        )}
      >
        <IconoTilde />
      </span>
      {children}
    </div>
  );
}

/** Reglas de contraseña de la maqueta; `coinciden` suma la 4.ª ("Las dos coinciden"). */
export function ReglasPassword({ password, coinciden }: { password: string; coinciden?: boolean }) {
  return (
    <div className="flex flex-col gap-2.5">
      <Regla ok={REGLAS_PASSWORD.largo(password)}>8 caracteres o más</Regla>
      <Regla ok={REGLAS_PASSWORD.numero(password)}>Al menos un número</Regla>
      <Regla ok={REGLAS_PASSWORD.simbolo(password)}>Al menos un símbolo (por ej. ! # $)</Regla>
      {coinciden !== undefined && <Regla ok={coinciden}>Las dos coinciden</Regla>}
    </div>
  );
}

export function AvisoAuth({ children, role = "alert" }: { children: ReactNode; role?: "alert" | "status" }) {
  return (
    <div
      role={role}
      className="mt-4 text-pretty rounded-[16px] bg-aviso-panel px-4 py-3.5 text-[15px] font-semibold leading-[1.45] text-aviso-panel-ink"
    >
      {children}
    </div>
  );
}

/** CTA principal: gris hasta que se puede usar, después teal con sombra. */
export function BotonCta({
  children,
  habilitado = true,
  grande,
  ...props
}: { habilitado?: boolean; grande?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      disabled={props.disabled || !habilitado}
      className={cn(
        "w-full rounded-full font-heading font-extrabold text-primary-foreground transition-[background-color,transform] active:scale-[0.98]",
        grande ? "h-[60px] text-lg" : "h-14 text-base",
        habilitado ? "bg-primary shadow-cta disabled:opacity-60" : "bg-deshabilitado"
      )}
    >
      {children}
    </button>
  );
}

export function BotonPildora({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className="mt-[18px] flex h-12 items-center gap-2 self-start rounded-full border border-teal-line bg-card px-5 text-[15.5px] font-bold text-teal-deep disabled:opacity-60"
    >
      {children}
    </button>
  );
}

/**
 * Seis cajas con un input invisible encima (maqueta "Ingresá tu código").
 * Solo dígitos: los códigos del backend son numéricos de 6.
 */
export function CodigoSeisCajas({
  valor,
  onChange,
  autoFocus,
  nombre = "codigo",
  disabled,
}: {
  valor: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
  nombre?: string;
  disabled?: boolean;
}) {
  const activa = Math.min(valor.length, 5);
  return (
    <div className="relative mt-[30px]">
      <div className="grid grid-cols-6 gap-2" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className={cn(
              "flex h-16 items-center justify-center rounded-[16px] bg-card text-[28px] font-extrabold transition-shadow",
              i === activa && valor.length < 6
                ? "shadow-[0_0_0_2px_var(--primary)]"
                : valor[i]
                  ? "shadow-[0_0_0_1.5px_var(--ink)]"
                  : "shadow-[0_0_0_1px_var(--line)]"
            )}
          >
            {valor[i] ?? ""}
          </div>
        ))}
      </div>
      <input
        name={nombre}
        value={valor}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        autoFocus={autoFocus}
        disabled={disabled}
        aria-label="Código de 6 dígitos"
        className="absolute inset-0 size-full cursor-text border-none text-base opacity-0"
      />
    </div>
  );
}

/** Lee el portapapeles y deja solo los dígitos (hasta 6). Nunca lanza. */
export async function leerCodigoPortapapeles(): Promise<string | null> {
  try {
    const texto = await navigator.clipboard.readText();
    const digitos = texto.replace(/\D/g, "").slice(0, 6);
    return digitos.length > 0 ? digitos : null;
  } catch {
    return null;
  }
}
