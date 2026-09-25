"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { VMark } from "@/components/vita/v-mark";
import { VitaIcon } from "@/lib/vita-icons";
import { generarVinculoAction, type EstadoVinculoGenerado } from "./actions";

// Mismo dominio de producción que el resto de la app (ver CLAUDE.md /
// Infra) — el QR y el link de WhatsApp necesitan una URL absoluta,
// `window.location.origin` no alcanza para un QR pensado para que OTRO
// celular lo escanee (no necesariamente sirve desde localhost en dev,
// pero eso también es cierto de cualquier deep link compartido).
const URL_BASE = "https://vitappweb.netlify.app";

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
    QRCode.toDataURL(url, { margin: 1, width: 240, color: { dark: "#0e7490", light: "#ffffff" } })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [estado]);

  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col overflow-hidden bg-gradient-to-b from-[#f8fbfc] to-white px-7 pb-8 pt-14">
      <div
        className="pointer-events-none absolute left-1/2 top-[-140px] size-[340px] -translate-x-1/2 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(8,145,178,0.12), transparent 60%)" }}
      />

      <div className="z-10 flex justify-center">
        <div className="flex size-16 items-center justify-center overflow-hidden rounded-full shadow-[0_14px_36px_rgba(8,145,178,0.28)]">
          <div className="flex size-full items-center justify-center" style={{ background: "linear-gradient(135deg, #22d3ee, #0e7490)" }}>
            <VMark size={42} />
          </div>
        </div>
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
    const texto = `Te invito a usar vita.ia para ayudarme con tu salud. Ingresá este código cuando te pida "¿tenés un código?": ${codigo}\n\n${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank");
  }

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="rounded-[28px] bg-card p-6 text-center shadow-[var(--shadow-card,0_8px_24px_rgba(15,33,54,0.06))]">
        <div className="font-heading text-[42px] font-extrabold tracking-[0.15em] text-primary">{codigo}</div>
        <div className="mt-1 text-[11.5px] text-muted-foreground">Vence en {minutosRestantes} min</div>
      </div>

      {qrDataUrl && (
        <div className="rounded-[24px] bg-card p-4 shadow-[var(--shadow-card,0_8px_24px_rgba(15,33,54,0.06))]">
          {
            // eslint-disable-next-line @next/next/no-img-element -- data URI generado localmente (qrcode), no un asset de Next
            <img src={qrDataUrl} alt={`Código QR para vincular con el código ${codigo}`} width={200} height={200} />
          }
        </div>
      )}

      <button
        type="button"
        onClick={compartirWhatsApp}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-br from-[#22d3ee] to-[#0e7490] py-3.5 font-heading text-sm font-extrabold text-white shadow-[0_10px_24px_rgba(8,145,178,0.35)]"
      >
        <VitaIcon name="send" size={17} />
        Enviar por WhatsApp
      </button>
    </div>
  );
}
