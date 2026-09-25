"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { VitaAvatar } from "@/components/vita/v-mark";
import { VitaIcon } from "@/lib/vita-icons";
import { cn } from "@/lib/utils";
import { StepDots } from "../step-dots";
import { completarOnboardingAction, omitirOnboardingAction, agregarMedicamentoCatalogoAction } from "../actions";
import { CONDICIONES, MEDICAMENTOS_POR_CONDICION, DISCLAIMER_CATALOGO } from "@/lib/onboarding/catalogo-condiciones";
import { ETIQUETA_MOMENTO, ORDEN_MOMENTOS } from "@/lib/rutina/momento";
import type { MomentoDia } from "@/lib/medicamentos/tipos";

// Pasos del guion — "chip" es el original (un solo chip, tap-para-avanzar).
// "condiciones"/"catalogo"/"medicamento-form" son nuevos: multi-select con
// confirmación explícita, así que no pueden usar el mismo tap-avanza de
// "chip" (ver PasoCondicionesBloque/PasoCatalogoBloque/PasoMedicamentoFormBloque
// más abajo). "catalogo" y "medicamento-form" se insertan dinámicamente en
// `guion` (ver confirmarCondiciones/confirmarCatalogo) según lo que la
// persona haya elegido — nunca están hardcodeados en GUION_BASE.
type PasoChip = { id: string; tipo: "chip"; texto: string; chips?: string[]; final?: boolean };
type PasoCondiciones = { id: string; tipo: "condiciones"; texto: string };
type PasoCatalogo = { id: string; tipo: "catalogo"; texto: string; condicionId: string; condicionLabel: string };
type PasoMedicamentoForm = {
  id: string;
  tipo: "medicamento-form";
  texto: string;
  condicionId: string;
  condicionLabel: string;
  medicamento: { nombre: string; dosisSugerida?: string; unidad?: string };
};
type PasoScript = PasoChip | PasoCondiciones | PasoCatalogo | PasoMedicamentoForm;

const GUION_BASE: PasoScript[] = [
  { id: "greet", tipo: "chip", texto: "Hola 👋 Soy vita, tu asistente de salud. Voy a ayudarte a llevar tu historial al día." },
  { id: "edad", tipo: "chip", texto: "¿Cuántos años tenés?", chips: ["Menos de 30", "30–45", "Más de 45"] },
  { id: "cond", tipo: "condiciones", texto: "¿Tenés alguna condición de salud? Podés elegir más de una." },
  { id: "meds", tipo: "chip", texto: "¿Tomás algún medicamento regularmente?", chips: ["Sí, varios", "Uno solo", "No por ahora"] },
  { id: "done", tipo: "chip", texto: "Listo ✨ Ya puedo empezar a ayudarte. Podés completar el resto cuando quieras desde tu perfil.", final: true },
];

const FRECUENCIAS_MICROFORM = ["1 vez al día", "2 veces al día", "3 veces al día"];

type MensajeEncuesta = { from: "vita" | "user"; texto: string; id: string };

type Respuestas = {
  edad?: string;
  meds?: string;
  condicionesIds?: string[];
};

// Porta OnboardingChatScreen.jsx — guion fijo, NO pasa por Anthropic (a
// diferencia del chat real con vita). Al terminar, siembra
// condiciones/alergias/medicamentos reales y marca el onboarding como
// completo.
export function EncuestaOnboarding() {
  const [guion, setGuion] = useState<PasoScript[]>(GUION_BASE);
  const [paso, setPaso] = useState(0);
  const [mensajes, setMensajes] = useState<MensajeEncuesta[]>([]);
  // Arranca en true (el paso 0 siempre tiene un mensaje viniendo) — así el
  // efecto de abajo nunca necesita poner setEscribiendo(true) de forma
  // síncrona en su propio cuerpo (dispara react-hooks/set-state-in-effect);
  // "true" se vuelve a pedir desde los handlers de abajo (event handlers),
  // nunca desde el cuerpo de un efecto.
  const [escribiendo, setEscribiendo] = useState(true);
  const [pendiente, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);
  // Actualizado solo desde handlers (event handlers), nunca en el cuerpo
  // de render — asignar a un ref durante el render dispara react-hooks/refs.
  const respuestasRef = useRef<Respuestas>({});
  // Espejo de `guion` leído por el efecto de abajo — a propósito NO es la
  // dependencia del efecto (ver `insertarPasos`): `setGuion` (splice de
  // pasos nuevos) y `setPaso` (avanzar) ocurren en momentos distintos
  // (insertarPasos es síncrono, avanzar tiene un setTimeout de 400ms), así
  // que si el efecto también dependiera de `guion`, se dispararía dos
  // veces para el mismo paso — una por el cambio de `guion`, otra por el
  // de `paso` — duplicando la burbuja de vita. Solo se escribe desde
  // `insertarPasos` (event handler), nunca en el cuerpo de render.
  const guionRef = useRef<PasoScript[]>(GUION_BASE);

  useEffect(() => {
    const actual = guionRef.current[paso];
    if (!actual) return;

    const t = setTimeout(
      () => {
        setEscribiendo(false);
        setMensajes((prev) => [...prev, { from: "vita", texto: actual.texto, id: `v-${actual.id}` }]);
        if (actual.tipo === "chip" && actual.final) {
          setTimeout(() => {
            const r = respuestasRef.current;
            startTransition(() =>
              completarOnboardingAction({ edadRango: r.edad, condicionesIds: r.condicionesIds, medicamentos: r.meds })
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

  function agregarBurbujaUsuario(texto: string) {
    setMensajes((prev) => [...prev, { from: "user", texto, id: `u-${Date.now()}-${prev.length}` }]);
  }

  function avanzar() {
    setTimeout(() => {
      setEscribiendo(true);
      setPaso((p) => p + 1);
    }, 400);
  }

  function insertarPasos(nuevos: PasoScript[]) {
    if (nuevos.length === 0) return;
    const copia = [...guionRef.current];
    copia.splice(paso + 1, 0, ...nuevos);
    guionRef.current = copia; // el efecto lee de acá, no de `guion` (ver comentario arriba)
    setGuion(copia); // reactivo, solo para lo que se renderiza en JSX (pasoActual)
  }

  // Paso "cond" (chip original, tap-para-avanzar) — greet/edad/meds/done.
  function responderChip(texto: string) {
    const actual = guion[paso];
    agregarBurbujaUsuario(texto);
    if (actual.tipo === "chip") {
      respuestasRef.current = { ...respuestasRef.current, [actual.id]: texto };
    }
    avanzar();
  }

  // Paso "condiciones" — multi-select con "Continuar" explícito. Si hay
  // condiciones reales (no "Ninguna") con catálogo propio, inserta un paso
  // "catalogo" por cada una, antes de seguir a "meds".
  function confirmarCondiciones(seleccionadas: string[]) {
    const labels = seleccionadas.map((id) => CONDICIONES.find((c) => c.id === id)?.label ?? id);
    agregarBurbujaUsuario(labels.length > 0 ? labels.join(", ") : "Ninguna por ahora");
    respuestasRef.current = { ...respuestasRef.current, condicionesIds: seleccionadas };

    const reales = seleccionadas.filter((id) => id !== "ninguna" && MEDICAMENTOS_POR_CONDICION[id]);
    const nuevosPasos: PasoScript[] = reales.map((condId, idx) => {
      const label = CONDICIONES.find((c) => c.id === condId)?.label ?? condId;
      const pregunta = `¿Tomás alguno de estos para ${label.toLowerCase()}?`;
      return {
        id: `catalogo-${condId}`,
        tipo: "catalogo",
        texto: idx === 0 ? `${DISCLAIMER_CATALOGO}\n\n${pregunta}` : pregunta,
        condicionId: condId,
        condicionLabel: label,
      };
    });
    insertarPasos(nuevosPasos);
    avanzar();
  }

  // Paso "catalogo" — selección de medicamentos del catálogo de la
  // condición. "Ninguno de estos"/"Omitir por ahora" saltan sin crear
  // nada; seleccionar médicamentos inserta un "medicamento-form" por cada
  // uno elegido.
  function confirmarCatalogo(pasoActual: PasoCatalogo, seleccionadas: string[]) {
    const catalogo = MEDICAMENTOS_POR_CONDICION[pasoActual.condicionId] ?? [];
    const medicamentos = catalogo.filter((m) => seleccionadas.includes(m.nombre));
    agregarBurbujaUsuario(medicamentos.map((m) => m.nombre).join(", "));

    const nuevosPasos: PasoScript[] = medicamentos.map((m) => ({
      id: `med-${pasoActual.condicionId}-${m.nombre}`,
      tipo: "medicamento-form",
      texto: `Configuremos ${m.nombre}${m.dosisSugerida ? ` (${m.dosisSugerida}${m.unidad ? " " + m.unidad : ""})` : ""} — ¿cuándo lo tomás?`,
      condicionId: pasoActual.condicionId,
      condicionLabel: pasoActual.condicionLabel,
      medicamento: { nombre: m.nombre, dosisSugerida: m.dosisSugerida, unidad: m.unidad },
    }));
    insertarPasos(nuevosPasos);
    avanzar();
  }

  function omitirCatalogo(motivo: "ninguno" | "omitir") {
    agregarBurbujaUsuario(motivo === "ninguno" ? "Ninguno de estos" : "Omitir por ahora");
    avanzar();
  }

  // Paso "medicamento-form" — micro-form (dosis/momento/frecuencia).
  // "Guardar" crea el medicamento real (fire-and-forget, no bloquea el
  // guion); "Configurar después" solo avanza, sin crear nada.
  function guardarMedicamentoForm(
    pasoActual: PasoMedicamentoForm,
    datos: { dosis: string; momento: MomentoDia; frecuencia: string }
  ) {
    agregarBurbujaUsuario(`${pasoActual.medicamento.nombre} — ${ETIQUETA_MOMENTO[datos.momento]}`);
    avanzar();

    agregarMedicamentoCatalogoAction({
      nombre: pasoActual.medicamento.nombre,
      dosis: datos.dosis.trim() || null,
      unidad: pasoActual.medicamento.unidad,
      momentoDia: datos.momento,
      frecuencia: datos.frecuencia,
      condicion: pasoActual.condicionLabel,
    }).then((resultado) => {
      if (resultado.status === "error") {
        toast.error(`No se pudo guardar ${pasoActual.medicamento.nombre}: ${resultado.message}`);
      }
    });
  }

  function omitirMedicamentoForm() {
    agregarBurbujaUsuario("Configurar después");
    avanzar();
  }

  const pasoActual = guion[paso];
  const mostrarInteractivo = !escribiendo && Boolean(pasoActual);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">
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
        {mensajes.map((m) => (
          <BurbujaMensaje key={m.id} m={m} />
        ))}
        {escribiendo && <PuntosEscribiendo />}

        {mostrarInteractivo && pasoActual.tipo === "chip" && !pasoActual.final && pasoActual.chips && pasoActual.chips.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pl-9">
            {pasoActual.chips.map((c) => (
              <ChipBoton key={c} texto={c} onClick={() => responderChip(c)} />
            ))}
          </div>
        )}

        {mostrarInteractivo && pasoActual.tipo === "condiciones" && (
          <div className="pl-9">
            <PasoCondicionesBloque onContinuar={confirmarCondiciones} />
          </div>
        )}

        {mostrarInteractivo && pasoActual.tipo === "catalogo" && (
          <div className="pl-9">
            <PasoCatalogoBloque key={pasoActual.id} paso={pasoActual} onContinuar={(sel) => confirmarCatalogo(pasoActual, sel)} onOmitir={omitirCatalogo} />
          </div>
        )}

        {mostrarInteractivo && pasoActual.tipo === "medicamento-form" && (
          <div className="pl-9">
            <PasoMedicamentoFormBloque
              key={pasoActual.id}
              paso={pasoActual}
              onGuardar={(datos) => guardarMedicamentoForm(pasoActual, datos)}
              onOmitir={omitirMedicamentoForm}
            />
          </div>
        )}
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

function BurbujaMensaje({ m }: { m: MensajeEncuesta }) {
  if (m.from === "user") {
    return (
      <div className="mb-2.5 flex justify-end">
        <div className="max-w-[78%] whitespace-pre-line rounded-[20px] rounded-br-[6px] bg-gradient-to-br from-[#22d3ee] to-[#0e7490] px-3.5 py-2.5 text-[14.5px] text-white">
          {m.texto}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-2.5 flex items-end gap-2">
      <VitaAvatar size={26} />
      <div className="max-w-[80%] whitespace-pre-line rounded-[20px] rounded-bl-[6px] bg-card px-3.5 py-2.5 text-[14.5px] leading-snug shadow-[var(--shadow-card,0_8px_24px_rgba(15,33,54,0.06))]">
        {m.texto}
      </div>
    </div>
  );
}

function ChipBoton({ texto, onClick }: { texto: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full bg-card px-3.5 py-2 text-[13px] font-semibold text-primary shadow-[inset_0_0_0_1px_var(--border)]"
    >
      {texto}
    </button>
  );
}

function PasoCondicionesBloque({ onContinuar }: { onContinuar: (seleccionadas: string[]) => void }) {
  const [seleccionadas, setSeleccionadas] = useState<string[]>([]);

  function alternar(id: string) {
    if (id === "ninguna") {
      setSeleccionadas((prev) => (prev.includes("ninguna") ? [] : ["ninguna"]));
      return;
    }
    setSeleccionadas((prev) => {
      const sinNinguna = prev.filter((x) => x !== "ninguna");
      return sinNinguna.includes(id) ? sinNinguna.filter((x) => x !== id) : [...sinNinguna, id];
    });
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap gap-1.5">
        {CONDICIONES.map((c) => {
          const sel = seleccionadas.includes(c.id);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => alternar(c.id)}
              className={cn(
                "rounded-full px-3.5 py-2 text-[13px] font-semibold",
                sel ? "bg-primary text-primary-foreground" : "bg-card text-primary shadow-[inset_0_0_0_1px_var(--border)]"
              )}
            >
              {c.label}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        disabled={seleccionadas.length === 0}
        onClick={() => onContinuar(seleccionadas)}
        className="self-start rounded-full bg-primary px-4.5 py-2 text-[12.5px] font-bold text-primary-foreground disabled:opacity-50"
      >
        Continuar
      </button>
    </div>
  );
}

function PasoCatalogoBloque({
  paso,
  onContinuar,
  onOmitir,
}: {
  paso: PasoCatalogo;
  onContinuar: (seleccionadas: string[]) => void;
  onOmitir: (motivo: "ninguno" | "omitir") => void;
}) {
  const [seleccionadas, setSeleccionadas] = useState<string[]>([]);
  // "Otro" no se renderiza como chip acá: elegirlo requeriría texto libre,
  // que este catálogo nunca ofrece (ver hard constraint en el brief) — la
  // entrada "Otro" existe en el dato para otros consumidores del catálogo,
  // no para esta pantalla.
  const medicamentos = (MEDICAMENTOS_POR_CONDICION[paso.condicionId] ?? []).filter((m) => m.nombre !== "Otro");

  function alternar(nombre: string) {
    setSeleccionadas((prev) => (prev.includes(nombre) ? prev.filter((n) => n !== nombre) : [...prev, nombre]));
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap gap-1.5">
        {medicamentos.map((m) => {
          const sel = seleccionadas.includes(m.nombre);
          return (
            <button
              key={m.nombre}
              type="button"
              onClick={() => alternar(m.nombre)}
              className={cn(
                "rounded-full px-3.5 py-2 text-[13px] font-semibold",
                sel ? "bg-primary text-primary-foreground" : "bg-card text-primary shadow-[inset_0_0_0_1px_var(--border)]"
              )}
            >
              {m.nombre}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onOmitir("ninguno")}
          className="rounded-full bg-secondary px-3.5 py-2 text-[12px] font-semibold text-muted-foreground"
        >
          Ninguno de estos
        </button>
        <button
          type="button"
          onClick={() => onOmitir("omitir")}
          className="rounded-full bg-secondary px-3.5 py-2 text-[12px] font-semibold text-muted-foreground"
        >
          Omitir por ahora
        </button>
        {seleccionadas.length > 0 && (
          <button
            type="button"
            onClick={() => onContinuar(seleccionadas)}
            className="rounded-full bg-primary px-4 py-2 text-[12px] font-bold text-primary-foreground"
          >
            Continuar
          </button>
        )}
      </div>
    </div>
  );
}

function PasoMedicamentoFormBloque({
  paso,
  onGuardar,
  onOmitir,
}: {
  paso: PasoMedicamentoForm;
  onGuardar: (datos: { dosis: string; momento: MomentoDia; frecuencia: string }) => void;
  onOmitir: () => void;
}) {
  const [dosis, setDosis] = useState(
    paso.medicamento.dosisSugerida ? `${paso.medicamento.dosisSugerida}${paso.medicamento.unidad ? ` ${paso.medicamento.unidad}` : ""}` : ""
  );
  const [momento, setMomento] = useState<MomentoDia | null>(null);
  const [frecuencia, setFrecuencia] = useState(FRECUENCIAS_MICROFORM[0]);

  return (
    <div className="flex flex-col gap-2.5 rounded-[20px] bg-card p-3.5 shadow-[var(--shadow-card,0_8px_24px_rgba(15,33,54,0.06))]">
      <input
        value={dosis}
        onChange={(e) => setDosis(e.target.value)}
        placeholder="Dosis (opcional)"
        className="rounded-[14px] bg-secondary px-3 py-2 text-[13px] font-medium outline-none"
      />
      <div className="flex flex-wrap gap-1.5">
        {ORDEN_MOMENTOS.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMomento(m)}
            className={cn(
              "rounded-full px-3 py-1.5 text-[12px] font-semibold",
              momento === m ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"
            )}
          >
            {ETIQUETA_MOMENTO[m]}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {FRECUENCIAS_MICROFORM.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFrecuencia(f)}
            className={cn(
              "rounded-full px-3 py-1.5 text-[12px] font-semibold",
              frecuencia === f ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"
            )}
          >
            {f}
          </button>
        ))}
      </div>
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onOmitir} className="flex-1 rounded-full bg-secondary py-2 text-[12.5px] font-semibold">
          Configurar después
        </button>
        <button
          type="button"
          disabled={!momento}
          onClick={() => momento && onGuardar({ dosis, momento, frecuencia })}
          className="flex-1 rounded-full bg-primary py-2 text-[12.5px] font-bold text-primary-foreground disabled:opacity-50"
        >
          Guardar
        </button>
      </div>
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
