"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { VMark } from "@/components/vita/v-mark";
import { VitaIcon } from "@/lib/vita-icons";
import { enviarCodigoPorMailAction, generarVinculoAction, type EstadoVinculoGenerado } from "./actions";

// Mismo dominio de producción que el resto de la app (ver CLAUDE.md /
// Infra) — el QR y el link de WhatsApp necesitan una URL absoluta,
// `window.location.origin` no alcanza para un QR pensado para que OTRO
// celular lo escanee (no necesariamente sirve desde localhost en dev,
// pero eso también es cierto de cualquier deep link compartido).
const URL_BASE = "https://vitappweb.netlify.app";

// qrcode necesita colores concretos (no acepta var()): se resuelven en
// runtime desde los tokens de globals.css.
function coloresQr() {
  const css = getComputedStyle(document.documentElement);
  return { dark: css.getPropertyValue("--teal-deep").trim(), light: css.getPropertyValue("--card").trim() };
}

export function PantallaVincularCuidado({ perfilPendienteId }: { perfilPendienteId?: string }) {
  const [estado, setEstado] = useState<EstadoVinculoGenerado>({ status: "cargando" });
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  // Guarda "ya pedí el código" sin ser reactivo — no dispara
  // react-hooks/set-state-in-effect porque nunca se lee en el render,
  // solo evita pedir un segundo código si el efecto se re-ejecuta (mismo
  // criterio que el resto del proyecto, ver CLAUDE.md).
  const yaPedidoRef = useRef(false);

  useEffect(() => {
    if (yaPedidoRef.current) return;
    yaPedidoRef.current = true;
    generarVinculoAction(perfilPendienteId).then(setEstado);
  }, [perfilPendienteId]);

  useEffect(() => {
    if (estado.status !== "listo") return;
    const url = `${URL_BASE}/onboarding/inicio?codigo=${estado.codigo}`;
    QRCode.toDataURL(url, { margin: 1, width: 240, color: coloresQr() })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [estado]);

  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col overflow-hidden bg-gradient-to-b from-background to-card px-7 pb-8 pt-14">
      <div
        className="pointer-events-none absolute left-1/2 top-[-140px] size-[340px] -translate-x-1/2 rounded-full"
        style={{ background: "radial-gradient(circle, color-mix(in srgb, var(--primary) 12%, transparent), transparent 60%)" }}
      />

      <div className="z-10 flex justify-center">
        <VMark size={64} />
      </div>

      <div className="z-10 mt-7.5 text-center">
        <div className="font-heading text-[24px] font-extrabold tracking-tight">Vinculá el celular de quien cuidás</div>
        <div className="mt-1.5 text-sm text-muted-foreground">
          Compartile este código o el QR — cuando lo ingrese, vas a poder ver su adherencia desde Modo cuidador.
        </div>
      </div>

      <div className="z-10 mt-7 flex-1">
        {estado.status === "cargando" && <EstadoCargando />}
        {estado.status === "error" && <EstadoError mensaje={estado.mensaje} />}
        {estado.status === "listo" && (
          <ContenidoListo codigo={estado.codigo} expiraAt={estado.expiraAt} qrDataUrl={qrDataUrl} />
        )}
      </div>

      <Link
        href="/app"
        className="z-10 mt-4 self-center text-sm font-semibold text-muted-foreground"
      >
        Lo hago más tarde
      </Link>
    </div>
  );
}

function EstadoCargando() {
  return (
    <div className="flex flex-col items-center gap-3 py-10">
      <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      <p className="text-sm text-muted-foreground">Generando código…</p>
    </div>
  );
}

function EstadoError({ mensaje }: { mensaje: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-[16px] bg-destructive/10 px-3.5 py-3 text-sm text-destructive">
      <VitaIcon name="alert-triangle" size={18} className="mt-0.5 shrink-0" />
      <span>{mensaje}</span>
    </div>
  );
}

function ContenidoListo({
  codigo,
  expiraAt,
  qrDataUrl,
}: {
  codigo: string;
  expiraAt: string;
  qrDataUrl: string | null;
}) {
  const url = `${URL_BASE}/onboarding/inicio?codigo=${codigo}`;
  const minutosRestantes = Math.max(0, Math.round((new Date(expiraAt).getTime() - new Date().getTime()) / 60000));

  function compartirWhatsApp() {
    const texto = `Te invito a usar vita para ayudarme con tu salud. Ingresá este código cuando te pida "¿tenés un código?": ${codigo}\n\n${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank");
  }

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="rounded-[28px] bg-card p-6 text-center shadow-card">
        <div className="font-heading text-[42px] font-extrabold tracking-[0.15em] text-primary">{codigo}</div>
        <div className="mt-1 text-[11.5px] text-muted-foreground">Vence en {minutosRestantes} min</div>
      </div>

      {qrDataUrl && (
        <div className="rounded-[24px] bg-card p-4 shadow-card">
          {
            // eslint-disable-next-line @next/next/no-img-element -- data URI generado localmente (qrcode), no un asset de Next
            <img src={qrDataUrl} alt={`Código QR para vincular con el código ${codigo}`} width={200} height={200} />
          }
        </div>
      )}

      <button
        type="button"
        onClick={compartirWhatsApp}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-br from-brand-from to-brand-to py-3.5 font-heading text-sm font-extrabold text-primary-foreground shadow-[0_10px_24px_color-mix(in_srgb,var(--primary)_35%,transparent)]"
      >
        <VitaIcon name="send" size={17} />
        Enviar por WhatsApp
      </button>

      <EnvioPorMail codigo={codigo} />
    </div>
  );
}

// Envío opcional por mail. Tras enviar, el botón queda deshabilitado 30 s y
// pasa a "Reenviar"; además el server limita a 5 envíos por código.
const ESPERA_REENVIO_S = 30;

function EnvioPorMail({ codigo }: { codigo: string }) {
  const [email, setEmail] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [espera, setEspera] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (espera <= 0) return;
    const t = setTimeout(() => setEspera((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [espera]);

  async function enviar() {
    setEnviando(true);
    setError(null);
    const r = await enviarCodigoPorMailAction(codigo, email);
    setEnviando(false);
    if (r.status === "success") {
      setEnviado(true);
      setEspera(ESPERA_REENVIO_S);
    } else {
      setError(r.mensaje);
    }
  }

  return (
    <div className="flex w-full flex-col gap-2 rounded-[20px] bg-card p-4 shadow-card">
      <div className="font-heading text-[14px] font-bold">¿Preferís mandárselo por mail?</div>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="email@ejemplo.com"
        className="rounded-[20px] bg-secondary px-3.5 py-3 text-sm font-medium outline-none"
      />
      <button
        type="button"
        onClick={enviar}
        disabled={!email.trim() || enviando || espera > 0}
        className="rounded-full bg-secondary py-3 font-heading text-sm font-bold text-primary disabled:opacity-50"
      >
        {enviando
          ? "Enviando…"
          : espera > 0
            ? `Reenviar en ${espera} s`
            : enviado
              ? "Reenviar mail"
              : "Mandar código por mail"}
      </button>
      {enviado && !error && <p className="text-xs text-muted-foreground">Mail enviado a {email.trim()}.</p>}
      {error && <p className="rounded-[14px] bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
