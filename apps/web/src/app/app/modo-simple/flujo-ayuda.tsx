"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { VitaIcon } from "@/lib/vita-icons";
import { ZONA_AR } from "@/lib/tiempo-ar";
import { pedirAyudaSimpleAction } from "@/lib/modo-simple/actions";
import { unirNombres } from "@/lib/modo-simple/respuestas";

// Botón "Ayuda" del modo simple (diseño "Vita Modo Simple v2"): pregunta
// "¿Necesitás ayuda ahora?", cuenta unos segundos con "Cancelar" (por si fue
// sin querer), avisa a TODOS sus cuidadores (aviso en la app + notificación) y
// después ofrece llamar. Solo dice "Ya les avisé" si el servidor lo confirmó.
// El llamado es un botón: un `tel:` automático, sin el toque, no es confiable.

const SEGUNDOS = 5;

type Estado =
  | { tipo: "pregunta" }
  | { tipo: "cuenta"; quedan: number }
  | { tipo: "enviando" }
  | { tipo: "avisado"; nombres: string[] }
  | { tipo: "no-avisado"; razon: "sin-cuidadores" | "tope" | "error" | "sin-conexion" };

export type AyudaPedida = { nombres: string[]; hora: string };

function horaAhora(): string {
  return new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: ZONA_AR }).format(new Date());
}

const TITULO_NO_AVISADO: Record<"sin-cuidadores" | "tope" | "error" | "sin-conexion", { titulo: string; texto: string }> = {
  "sin-cuidadores": { titulo: "Todavía nadie te cuida en vita", texto: "No tengo a quién avisarle. Llamá vos:" },
  tope: { titulo: "Ya pediste ayuda hace un rato", texto: "No volví a avisar. Si necesitás, llamá:" },
  error: { titulo: "No pude avisarle a tu familia", texto: "Llamá vos:" },
  "sin-conexion": { titulo: "No hay internet", texto: "No les puedo avisar ahora. Llamá vos:" },
};

export function FlujoAyuda({
  telefono,
  contacto,
  onCerrar,
  onAvisados,
}: {
  telefono: string | null;
  contacto: string | null;
  onCerrar: () => void;
  onAvisados: (a: AyudaPedida) => void;
}) {
  const [estado, setEstado] = useState<Estado>({ tipo: "pregunta" });
  const enviado = useRef(false);
  const telLimpio = telefono?.replace(/[^\d+]/g, "") || null;

  async function enviar() {
    if (enviado.current) return;
    enviado.current = true;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setEstado({ tipo: "no-avisado", razon: "sin-conexion" });
      return;
    }
    setEstado({ tipo: "enviando" });
    const r = await pedirAyudaSimpleAction().catch(() => ({ status: "no-avisado" as const, razon: "error" as const }));
    if (r.status === "avisado") {
      setEstado({ tipo: "avisado", nombres: r.nombres });
      onAvisados({ nombres: r.nombres, hora: horaAhora() });
    } else {
      setEstado({ tipo: "no-avisado", razon: r.razon });
    }
  }

  // Cuenta regresiva: un segundo por vez; al llegar a 0 avisa.
  useEffect(() => {
    if (estado.tipo !== "cuenta") return;
    const t = setTimeout(() => {
      if (estado.quedan <= 1) void enviar();
      else setEstado({ tipo: "cuenta", quedan: estado.quedan - 1 });
    }, 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado]);

  const botonesLlamar = (
    <div className="flex w-full flex-col gap-3">
      {telLimpio ? (
        <a
          href={`tel:${telLimpio}`}
          className="flex h-[68px] items-center justify-center gap-2.5 rounded-full bg-destructive text-[21px] font-extrabold text-primary-foreground shadow-[0_8px_20px_color-mix(in_srgb,var(--destructive)_32%,transparent)]"
        >
          <VitaIcon name="phone" size={24} strokeWidth={2.4} />
          {contacto ? `Llamar a ${contacto}` : "Llamar a mi contacto"}
        </a>
      ) : (
        <Link
          href="/app/perfil/contacto-emergencia"
          className="flex h-[60px] items-center justify-center rounded-full bg-card text-[17px] font-extrabold text-teal-deep shadow-card"
        >
          Cargar a quién llamar
        </Link>
      )}
      <a href="tel:107" className="flex h-[60px] items-center justify-center gap-2 rounded-full bg-card text-[18px] font-extrabold text-destructive shadow-card">
        <VitaIcon name="phone" size={20} strokeWidth={2.4} />
        Llamar al 107
      </a>
    </div>
  );

  return (
    <div role="dialog" aria-modal="true" aria-label="Pedir ayuda" className="fixed inset-0 z-50 flex flex-col bg-cream px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))]">
      {(estado.tipo === "pregunta" || estado.tipo === "avisado" || estado.tipo === "no-avisado") && (
        <button type="button" onClick={onCerrar} className="flex h-12 items-center gap-1.5 self-start text-[18px] font-bold text-slate-brand">
          <VitaIcon name="chevron-left" size={22} />
          Volver
        </button>
      )}

      <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
        {estado.tipo === "pregunta" && (
          <>
            <div className="flex size-24 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <VitaIcon name="alert-triangle" size={44} strokeWidth={2.2} />
            </div>
            <h1 className="font-heading text-[32px] font-extrabold leading-tight tracking-[-0.03em]">¿Necesitás ayuda ahora?</h1>
            <p className="text-pretty text-[19px] font-medium leading-[1.45] text-slate-brand">
              Le aviso a tu familia{contacto && telLimpio ? ` y te ayudo a llamar a ${contacto}` : ""}.
            </p>
            <div className="mt-2 flex w-full flex-col gap-3">
              <button
                type="button"
                onClick={() => setEstado({ tipo: "cuenta", quedan: SEGUNDOS })}
                className="h-[68px] rounded-full bg-destructive text-[21px] font-extrabold text-primary-foreground shadow-[0_8px_20px_color-mix(in_srgb,var(--destructive)_32%,transparent)]"
              >
                Sí, pedir ayuda
              </button>
              <button type="button" onClick={onCerrar} className="h-[60px] rounded-full bg-card text-[19px] font-extrabold text-foreground shadow-card">
                No, estoy bien
              </button>
            </div>
          </>
        )}

        {estado.tipo === "cuenta" && (
          <>
            <div aria-live="assertive" className="flex size-32 items-center justify-center rounded-full bg-destructive text-[56px] font-extrabold text-primary-foreground tabular-nums">
              {estado.quedan}
            </div>
            <h1 className="font-heading text-[30px] font-extrabold tracking-[-0.03em]">Pidiendo ayuda…</h1>
            <p className="text-[19px] font-medium text-slate-brand">Si fue sin querer, tocá Cancelar.</p>
            <button type="button" onClick={onCerrar} className="mt-2 h-[64px] w-full rounded-full bg-card text-[20px] font-extrabold text-foreground shadow-card">
              Cancelar
            </button>
          </>
        )}

        {estado.tipo === "enviando" && (
          <>
            <div className="size-16 animate-spin rounded-full border-4 border-destructive/20 border-t-destructive motion-reduce:animate-none" aria-hidden />
            <h1 className="font-heading text-[28px] font-extrabold tracking-[-0.03em]">Avisándole a tu familia…</h1>
          </>
        )}

        {estado.tipo === "avisado" && (
          <>
            <div className="flex size-24 items-center justify-center rounded-full bg-success/15 text-success">
              <VitaIcon name="check" size={46} strokeWidth={2.6} />
            </div>
            <h1 className="font-heading text-[32px] font-extrabold tracking-[-0.03em]">Ya les avisé</h1>
            <p className="text-pretty text-[19px] font-medium leading-[1.45] text-slate-brand">
              {estado.nombres.length > 0 ? `${unirNombres(estado.nombres)} ya ${estado.nombres.length === 1 ? "sabe" : "saben"} que necesitás ayuda.` : "Tu familia ya sabe que necesitás ayuda."}
            </p>
            {botonesLlamar}
          </>
        )}

        {estado.tipo === "no-avisado" && (
          <>
            <div className="flex size-24 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <VitaIcon name="phone" size={42} strokeWidth={2.2} />
            </div>
            <h1 className="font-heading text-[30px] font-extrabold leading-tight tracking-[-0.03em]">{TITULO_NO_AVISADO[estado.razon].titulo}</h1>
            <p className="text-pretty text-[19px] font-medium leading-[1.45] text-slate-brand">{TITULO_NO_AVISADO[estado.razon].texto}</p>
            {botonesLlamar}
          </>
        )}
      </div>
    </div>
  );
}
