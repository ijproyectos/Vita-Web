"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { VitaAvatar } from "@/components/vita/v-mark";
import { VitaIcon } from "@/lib/vita-icons";
import { StepDots } from "../step-dots";
import { completarOnboardingAction, omitirOnboardingAction } from "../actions";

type PasoScript = { id: string; texto: string; chips?: string[]; final?: boolean };

const GUION: PasoScript[] = [
  { id: "greet", texto: "Hola 👋 Soy vita, tu asistente de salud. Voy a ayudarte a llevar tu historial al día." },
  { id: "edad", texto: "¿Cuántos años tenés?", chips: ["Menos de 30", "30–45", "Más de 45"] },
  { id: "cond", texto: "¿Tenés alguna condición de salud?", chips: ["Diabetes", "Hipertensión", "Alergias", "Ninguna por ahora"] },
  { id: "meds", texto: "¿Tomás algún medicamento regularmente?", chips: ["Sí, varios", "Uno solo", "No por ahora"] },
  { id: "done", texto: "Listo ✨ Ya puedo empezar a ayudarte. Podés completar el resto cuando quieras desde tu perfil.", final: true },
];

type MensajeEncuesta = { from: "vita" | "user"; texto: string; chips?: string[]; id: string };

// Porta OnboardingChatScreen.jsx — guion fijo, NO pasa por Anthropic (a
// diferencia del chat real con vita). Al terminar, siembra
// condiciones/alergias reales y marca el onboarding como completo.
export function EncuestaOnboarding() {
  const [paso, setPaso] = useState(0);
  const [mensajes, setMensajes] = useState<MensajeEncuesta[]>([]);
  // Arranca en true (el paso 0 siempre tiene un mensaje viniendo) — así el
  // efecto de abajo nunca necesita poner setEscribiendo(true) de forma
  // síncrona en su propio cuerpo (dispara react-hooks/set-state-in-effect);
  // "true" se vuelve a pedir desde responder(), un event handler, no un
  // efecto.
  const [escribiendo, setEscribiendo] = useState(true);
  const [pendiente, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);
  // Actualizado solo desde responder() (event handler), nunca en el cuerpo
  // de render — asignar a un ref durante el render dispara react-hooks/refs.
  const respuestasRef = useRef<Record<string, string>>({});

  useEffect(() => {
    const actual = GUION[paso];
    if (!actual) return;

    const t = setTimeout(
      () => {
        setEscribiendo(false);
        setMensajes((prev) => [...prev, { from: "vita", texto: actual.texto, chips: actual.chips, id: `v-${paso}` }]);
        if (actual.final) {
          setTimeout(() => {
            const r = respuestasRef.current;
            startTransition(() =>
              completarOnboardingAction({ edadRango: r.edad, condicion: r.cond, medicamentos: r.meds })
            );
          }, 1200);
        }
      },
      paso === 0 ? 500 : 900
    );

    return () => clearTimeout(t);
  }, [paso]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [mensajes, escribiendo]);

  function responder(texto: string) {
    const idActual = GUION[paso]?.id;
    setMensajes((prev) => [...prev, { from: "user", texto, id: `u-${Date.now()}` }]);
    if (idActual) {
      respuestasRef.current = { ...respuestasRef.current, [idActual]: texto };
    }
    if (paso < GUION.length - 1) {
      setTimeout(() => {
        setEscribiendo(true);
        setPaso((p) => p + 1);
      }, 400);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex items-center justify-between px-6 pb-3 pt-4.5">
        <StepDots total={3} activo={2} />
        <button
          type="button"
          onClick={() => startTransition(() => omitirOnboardingAction())}
          disabled={pendiente}
          className="text-sm font-semibold text-primary"
        >
          Omitir
        </button>
      </div>

      <div className="mt-1 text-center">
        <div className="flex items-center justify-center gap-2">
          <VitaAvatar size={30} />
          <div className="font-heading text-[15px] font-bold">vita</div>
        </div>
        <div className="mt-0.5 text-[11.5px] text-muted-foreground">conociéndote</div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {mensajes.map((m, i) => (
          <MensajeEncuestaBurbuja
            key={m.id}
            m={m}
            mostrarChips={m.from === "vita" && i === mensajes.length - 1 && !escribiendo}
            onElegir={responder}
          />
        ))}
        {escribiendo && <PuntosEscribiendo />}
      </div>

      <div className="px-4.5 pb-1.5 text-center text-[11px] text-muted-foreground">
        Podés completar esto después desde tu perfil
      </div>
      <div className="px-3.5 pb-7.5 pt-2.5">
        <div className="flex items-center gap-2 rounded-full bg-card py-1.5 pl-4.5 shadow-[0_8px_24px_rgba(15,33,54,0.08)]">
          <span className="flex-1 py-2 text-[15px] text-muted-foreground">
            {escribiendo ? "vita está escribiendo…" : "Elegí una opción arriba"}
          </span>
          <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <VitaIcon name="mic" size={18} />
          </div>
        </div>
      </div>
    </div>
  );
}

function MensajeEncuestaBurbuja({
  m,
  mostrarChips,
  onElegir,
}: {
  m: MensajeEncuesta;
  mostrarChips: boolean;
  onElegir: (texto: string) => void;
}) {
  if (m.from === "user") {
    return (
      <div className="mb-2.5 flex justify-end">
        <div className="max-w-[78%] rounded-[20px] rounded-br-[6px] bg-gradient-to-br from-[#22d3ee] to-[#0e7490] px-3.5 py-2.5 text-[14.5px] text-white">
          {m.texto}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-2.5 flex flex-col gap-2">
      <div className="flex items-end gap-2">
        <VitaAvatar size={26} />
        <div className="max-w-[80%] rounded-[20px] rounded-bl-[6px] bg-card px-3.5 py-2.5 text-[14.5px] leading-snug shadow-[var(--shadow-card,0_8px_24px_rgba(15,33,54,0.06))]">
          {m.texto}
        </div>
      </div>
      {mostrarChips && m.chips && (
        <div className="flex flex-wrap gap-1.5 pl-9">
          {m.chips.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onElegir(c)}
              className="rounded-full bg-card px-3.5 py-2 text-[13px] font-semibold text-primary shadow-[inset_0_0_0_1px_var(--border)]"
            >
              {c}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PuntosEscribiendo() {
  return (
    <div className="flex items-end gap-2">
      <VitaAvatar size={26} />
      <div className="flex gap-1 rounded-[20px] rounded-bl-[6px] bg-card px-4 py-3 shadow-[var(--shadow-card,0_8px_24px_rgba(15,33,54,0.06))]">
        {[0, 1, 2].map((i) => (
          <span key={i} className="size-1.5 animate-pulse rounded-full bg-primary" style={{ animationDelay: `${i * 0.15}s` }} />
        ))}
      </div>
    </div>
  );
}
