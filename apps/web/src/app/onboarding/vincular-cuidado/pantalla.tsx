"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { VMark } from "@/components/vita/v-mark";
import { VitaIcon } from "@/lib/vita-icons";
import { enviarCodigoPorMailAction, generarVinculoAction, type EstadoVinculoGenerado } from "./actions";

// Mismo dominio de producción que el resto de la app (ver CLAUDE.md /
// Infra) — el link de WhatsApp necesita una URL absoluta para que OTRO
// celular pueda abrirla.
const URL_BASE = "https://vitappweb.netlify.app";

export function PantallaVincularCuidado({ perfilPendienteId }: { perfilPendienteId?: string }) {
  const [estado, setEstado] = useState<EstadoVinculoGenerado>({ status: "cargando" });
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

  const [aviso, setAviso] = useState<string | null>(null);

  function regenerar() {
    setAviso(null);
    setEstado({ status: "cargando" });
    generarVinculoAction(perfilPendienteId).then(setEstado);
  }

  function cambiarCodigo(codigo: string, expiraAt: string, aviso: string) {
    setAviso(aviso);
    setEstado({ status: "listo", codigo, expiraAt });
  }

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
          Compartile este código — cuando lo ingrese, vas a poder ver su adherencia desde Modo cuidador.
        </div>
      </div>

      <div className="z-10 mt-7 flex-1">
        {estado.status === "cargando" && <EstadoCargando />}
        {estado.status === "error" && <EstadoError mensaje={estado.mensaje} />}
        {estado.status === "listo" && (
          <ContenidoListo
            key={estado.codigo}
            codigo={estado.codigo}
            expiraAt={estado.expiraAt}
            aviso={aviso}
            onRegenerar={regenerar}
            onCodigoNuevo={cambiarCodigo}
          />
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
  aviso,
  onRegenerar,
  onCodigoNuevo,
}: {
  codigo: string;
  expiraAt: string;
  aviso: string | null;
  onRegenerar: () => void;
  onCodigoNuevo: (codigo: string, expiraAt: string, aviso: string) => void;
}) {
  const url = `${URL_BASE}/onboarding/inicio?codigo=${codigo}`;
  // `ahora` se refresca cada 30 s desde un intervalo (setState dentro del
  // callback del intervalo, no en el cuerpo del efecto).
  const [ahora, setAhora] = useState(() => new Date().getTime());
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date().getTime()), 30_000);
    return () => clearInterval(t);
  }, []);

  const msRestantes = new Date(expiraAt).getTime() - ahora;
  const vencido = msRestantes <= 0;
  const minutosRestantes = Math.max(1, Math.ceil(msRestantes / 60000));

  function compartirWhatsApp() {
    const texto = `Te invito a usar vita para ayudarme con tu salud. Ingresá este código cuando te pida "¿tenés un código?": ${codigo}\n\n${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank");
  }

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="rounded-[28px] bg-card p-6 text-center shadow-card">
        <div
          className={`font-heading text-[42px] font-extrabold tracking-[0.15em] ${vencido ? "text-muted-foreground line-through" : "text-primary"}`}
        >
          {codigo}
        </div>
        <div className="mt-1 text-[11.5px] text-muted-foreground">
          {vencido ? "Este código venció" : `Vence en ${minutosRestantes} min`}
        </div>
      </div>

      {aviso && <p className="rounded-[14px] bg-secondary px-3.5 py-2.5 text-center text-xs text-muted-foreground">{aviso}</p>}

      {vencido ? (
        <BotonRegenerar onClick={onRegenerar} />
      ) : (
        <>
          <button
            type="button"
            onClick={compartirWhatsApp}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-br from-brand-from to-brand-to py-3.5 font-heading text-sm font-extrabold text-primary-foreground shadow-[0_10px_24px_color-mix(in_srgb,var(--primary)_35%,transparent)]"
          >
            <VitaIcon name="send" size={17} />
            Enviar por WhatsApp
          </button>

          <EnvioPorMail codigo={codigo} onCodigoNuevo={onCodigoNuevo} onRegenerar={onRegenerar} />
        </>
      )}
    </div>
  );
}

function BotonRegenerar({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-full bg-secondary py-3 font-heading text-sm font-bold text-primary"
    >
      Generar código nuevo
    </button>
  );
}

// Envío opcional por mail. Tras enviar, el botón queda deshabilitado 30 s y
// pasa a "Reenviar"; además el server limita a 5 envíos por código.
const ESPERA_REENVIO_S = 30;

function EnvioPorMail({
  codigo,
  onCodigoNuevo,
  onRegenerar,
}: {
  codigo: string;
  onCodigoNuevo: (codigo: string, expiraAt: string, aviso: string) => void;
  onRegenerar: () => void;
}) {
  const [email, setEmail] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [espera, setEspera] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [puedeRegenerar, setPuedeRegenerar] = useState(false);

  useEffect(() => {
    if (espera <= 0) return;
    const t = setTimeout(() => setEspera((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [espera]);

  async function enviar() {
    setEnviando(true);
    setError(null);
    setPuedeRegenerar(false);
    const r = await enviarCodigoPorMailAction(codigo, email);
    setEnviando(false);
    if (r.status === "success") {
      if (r.nuevoCodigo && r.expiraAt) {
        // El código anterior había vencido: la pantalla pasa a mostrar el
        // nuevo (se remonta por el `key` del padre; el aviso vive en el padre).
        onCodigoNuevo(
          r.nuevoCodigo,
          r.expiraAt,
          "Te generamos un código nuevo porque el anterior había vencido, y lo mandamos por mail."
        );
        return;
      }
      setEnviado(true);
      setEspera(ESPERA_REENVIO_S);
    } else {
      if (r.nuevoCodigo && r.expiraAt) {
        onCodigoNuevo(r.nuevoCodigo, r.expiraAt, r.mensaje);
        return;
      }
      setError(r.mensaje);
      setPuedeRegenerar(r.puedeRegenerar === true);
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
      {puedeRegenerar && <BotonRegenerar onClick={onRegenerar} />}
    </div>
  );
}
