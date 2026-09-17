"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { VitaIcon } from "@/lib/vita-icons";
import { VitaAvatar } from "@/components/vita/v-mark";
import { cn } from "@/lib/utils";
import { desbloquearVoz, obtenerAudioBlob, reproducirBlob } from "@/lib/voz/hablar-cliente";
import { useGrabacionVoz } from "@/lib/voz/usar-grabacion-voz";
import { marcarTomadoAction } from "../rutina/actions";

// Coincide EXACTO con el regex del diseño — nunca se toca esta lista de
// palabras sin actualizar también design/tasks.
const CONFIRMACION_POR_VOZ = /\b(s[ií]|tom[eé]|listo|ya est[aá])\b/i;

// Fases del state machine (spec: waiting | confirmed | alerted | resting).
// "confirmado" es transitoria (solo local, nunca viene del servidor): se
// entra al confirmar y se sale sola a los ~2.4s pidiendo un refresh del
// server component, que recalcula la próxima dosis pendiente (u ninguna).
type Fase = "esperando" | "alertado" | "confirmado" | "descanso";

type ProximaDosis = {
  id: string;
  nombre: string;
  dosis: string | null;
  unidad: string;
  horaProgramada: string;
};

const UNIDAD_HABLADA: Record<string, string> = {
  mg: "miligramos",
  ml: "mililitros",
  gotas: "gotas",
  UI: "unidades",
  "comp.": "comprimidos",
};

function fraseAnuncio(p: ProximaDosis): string {
  const unidadTexto = UNIDAD_HABLADA[p.unidad] ?? p.unidad;
  const dosisTexto = p.dosis ? `, ${p.dosis} ${unidadTexto}` : "";
  return `Es hora de tomar ${p.nombre}${dosisTexto}.`;
}

// Cada cuánto se pide un refresh del server component mientras la
// pantalla sigue abierta — así "esperando" pasa solo a "alertado" cuando
// vence el margen de gracia real (recalculado en el servidor con
// esDosisVencida/horaEnAR), sin reimplementar esa cuenta acá.
const INTERVALO_REFRESCO_MS = 45_000;

export function Pantalla({
  proxima,
  vencida,
  faltanMinutos,
}: {
  proxima: ProximaDosis | null;
  vencida: boolean;
  faltanMinutos: number;
}) {
  const router = useRouter();
  // esperando/alertado/descanso se derivan directo de las props en cada
  // render — nunca se guardan en useState, así el refresco periódico (que
  // trae un nuevo `vencida` para la MISMA dosis; un cambio de dosis
  // siempre remonta este componente entero vía key={pendiente.id} en el
  // padre) se refleja solo, sin un efecto sincronizando estado derivado.
  // "confirmado" es la única fase que sí necesita estado local: es
  // puramente transitoria y nunca la manda el servidor.
  const [confirmadoLocal, setConfirmadoLocal] = useState(false);
  const fase: Fase = confirmadoLocal ? "confirmado" : !proxima ? "descanso" : vencida ? "alertado" : "esperando";
  const [audioDesbloqueado, setAudioDesbloqueado] = useState(false);
  const [pendiente, startTransition] = useTransition();

  useEffect(() => {
    const id = setInterval(() => router.refresh(), INTERVALO_REFRESCO_MS);
    return () => clearInterval(id);
  }, [router]);

  async function reproducirAnuncio() {
    if (!proxima) return;
    const blob = await obtenerAudioBlob(fraseAnuncio(proxima));
    await reproducirBlob(blob);
  }

  function alDesbloquear() {
    // Tiene que ser lo primero, todavía dentro del gesto sincrónico del
    // tap — después de este punto todo es async y en Safari/iOS ya sería
    // tarde para desbloquear el motor de audio (mismo criterio que
    // vita-chat-overlay.tsx).
    desbloquearVoz();
    setAudioDesbloqueado(true);
    void reproducirAnuncio();
  }

  function confirmar() {
    if (!proxima || pendiente) return;
    startTransition(async () => {
      try {
        await marcarTomadoAction(proxima.id, true);
        setConfirmadoLocal(true);
      } catch {
        toast.error("No se pudo registrar la toma. Probá de nuevo.");
      }
    });
  }

  useEffect(() => {
    if (!confirmadoLocal) return;
    const t = setTimeout(() => router.refresh(), 2400);
    return () => clearTimeout(t);
  }, [confirmadoLocal, router]);

  const { estado: estadoVoz, iniciar: iniciarVoz, detener: detenerVoz } = useGrabacionVoz({
    onTranscripcion: (texto) => {
      if (CONFIRMACION_POR_VOZ.test(texto)) {
        confirmar();
      } else {
        toast.info("No te escuché confirmar — tocá el botón cuando la hayas tomado.");
      }
      detenerVoz();
    },
    onError: (mensaje) => {
      toast.error(mensaje);
      detenerVoz();
    },
  });

  async function alternarEscuchaVoz() {
    if (estadoVoz !== "inactivo") {
      detenerVoz();
      return;
    }
    const resultado = await iniciarVoz();
    if (!resultado.ok) {
      toast.error(
        resultado.motivo === "permiso-denegado"
          ? "Necesitamos acceso al micrófono para confirmar por voz."
          : "Tu navegador no soporta confirmar por voz."
      );
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-background">
      <BotonSalir />

      {fase === "descanso" && <FaseDescanso />}

      {fase === "confirmado" && proxima && <FaseConfirmado nombre={proxima.nombre} />}

      {(fase === "esperando" || fase === "alertado") && proxima && !audioDesbloqueado && (
        <FaseGesto onTocar={alDesbloquear} />
      )}

      {(fase === "esperando" || fase === "alertado") && proxima && audioDesbloqueado && (
        <FaseDosisPendiente
          proxima={proxima}
          alertado={fase === "alertado"}
          faltanMinutos={faltanMinutos}
          confirmando={pendiente}
          escuchandoVoz={estadoVoz !== "inactivo"}
          onConfirmar={confirmar}
          onReescuchar={reproducirAnuncio}
          onAlternarVoz={alternarEscuchaVoz}
        />
      )}
    </div>
  );
}

// Salida discreta, presente en TODAS las fases — el mock original solo la
// mostraba en "descanso", pero dejar a alguien sin salida mientras hay una
// dosis pendiente (que puede durar todo el día) convertiría esto en una
// pantalla sin retorno real. Chica y en la esquina para no competir con el
// botón principal.
function BotonSalir() {
  return (
    <Link
      href="/app/perfil"
      className="absolute left-4 z-10 text-[12.5px] font-semibold text-muted-foreground underline"
      style={{ top: "max(1rem, env(safe-area-inset-top))" }}
    >
      Salir del modo simple
    </Link>
  );
}

function FaseGesto({ onTocar }: { onTocar: () => void }) {
  return (
    <button
      type="button"
      onClick={onTocar}
      className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center"
    >
      <div className="flex size-24 items-center justify-center rounded-full bg-chip-teal-bg text-chip-teal-ink">
        <VitaIcon name="volume" size={44} />
      </div>
      <div className="font-heading text-[26px] font-extrabold">Tocá para escuchar</div>
      <div className="text-[15px] text-muted-foreground">vita te va a leer tu medicación</div>
    </button>
  );
}

function FaseDosisPendiente({
  proxima,
  alertado,
  faltanMinutos,
  confirmando,
  escuchandoVoz,
  onConfirmar,
  onReescuchar,
  onAlternarVoz,
}: {
  proxima: ProximaDosis;
  alertado: boolean;
  faltanMinutos: number;
  confirmando: boolean;
  escuchandoVoz: boolean;
  onConfirmar: () => void;
  onReescuchar: () => void;
  onAlternarVoz: () => void;
}) {
  return (
    <>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
        <div
          className={cn(
            "flex size-24 items-center justify-center rounded-full",
            alertado ? "bg-chip-amber-bg text-chip-amber-ink" : "bg-chip-teal-bg text-chip-teal-ink"
          )}
        >
          <VitaIcon name={alertado ? "alert-triangle" : "bell"} size={44} />
        </div>
        <div className="text-[17px] font-semibold text-muted-foreground">
          {alertado
            ? "Todavía no confirmaste"
            : faltanMinutos > 0
              ? `En ${faltanMinutos} min es hora de tomar`
              : "Es hora de tomar"}
        </div>
        <div className="font-heading text-[38px] font-extrabold leading-tight">{proxima.nombre}</div>
        {(proxima.dosis || proxima.unidad) && (
          <span className="rounded-full bg-primary px-4.5 py-2 text-base font-bold text-primary-foreground">
            {[proxima.dosis, proxima.unidad].filter(Boolean).join(" ")} · {proxima.horaProgramada} hs
          </span>
        )}
        <button
          type="button"
          onClick={onReescuchar}
          aria-label="Escuchar de nuevo"
          className="mt-1 flex size-[52px] items-center justify-center rounded-full bg-card text-primary shadow-[0_8px_24px_rgba(15,33,54,0.1)]"
        >
          <VitaIcon name="volume" size={24} />
        </button>
      </div>

      <div className="flex flex-col gap-3 px-6" style={{ paddingBottom: "var(--safe-bottom)" }}>
        <button
          type="button"
          onClick={onConfirmar}
          disabled={confirmando}
          className="h-[76px] rounded-full bg-gradient-to-br from-[#22d3ee] to-[#0e7490] text-[22px] font-extrabold text-white shadow-[0_14px_28px_rgba(8,145,178,0.35)] disabled:opacity-70"
        >
          SÍ, YA LA TOMÉ
        </button>
        <button
          type="button"
          onClick={onAlternarVoz}
          className={cn(
            "flex h-[60px] items-center justify-center gap-2 rounded-full bg-card text-[16px] font-semibold text-primary shadow-[0_2px_10px_rgba(15,33,54,0.06)]",
            escuchandoVoz && "bg-chip-teal-bg"
          )}
        >
          <VitaIcon name="mic" size={19} />
          {escuchandoVoz ? "Escuchando…" : "Tocá y decí \"sí\""}
        </button>
      </div>
    </>
  );
}

function FaseConfirmado({ nombre }: { nombre: string }) {
  return (
    <div
      className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center text-white"
      style={{ background: "linear-gradient(135deg, #0891b2 0%, #0e7490 60%, #155e75 100%)" }}
    >
      <div className="flex size-24 items-center justify-center rounded-full bg-white/20">
        <VitaIcon name="check" size={44} color="#fff" />
      </div>
      <div className="font-heading text-[30px] font-extrabold">¡Muy bien!</div>
      <div className="text-[17px] opacity-90">Registramos que tomaste {nombre}</div>
    </div>
  );
}

function FaseDescanso() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
      <VitaAvatar size={64} />
      <div className="font-heading text-[24px] font-extrabold">Por ahora no tenés medicación pendiente</div>
      <div className="text-[15px] text-muted-foreground">Te vamos a avisar cuando sea la hora.</div>
    </div>
  );
}
