"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Interruptor } from "@/components/vita/interruptor";
import { Segmentado } from "@/components/vita/segmentado";
import { ErrorGuardarSheet } from "@/components/vita/error-guardar-sheet";
import { VitaIcon } from "@/lib/vita-icons";
import { cn } from "@/lib/utils";
import { guardarPrefsModoSimpleAction, type EstadoModoSimple } from "@/lib/modo-simple/actions";
import {
  POSPONER_OPCIONES,
  VELOCIDAD_VOZ_LENTA,
  type ClaveBooleanaMS,
  type MinutosPosponer,
  type ParcheModoSimple,
  type PrefsModoSimple,
} from "@/lib/modo-simple/tipos";
import { desbloquearVoz, obtenerAudioBlob, reproducirBlob } from "@/lib/voz/hablar-cliente";
import {
  BarraInferior,
  Cabecera,
  TarjetaDescanso,
  TarjetaGrupo,
  TarjetaMediciones,
  TarjetaSiguientes,
  TarjetaPorCorregir,
  TarjetaTurno,
  type Dosis,
  type MedicionSimple,
  type Siguiente,
  type PorCorregir,
  type TurnoSimple,
} from "@/components/vita/modo-simple/piezas";
import type { MomentoDia } from "@/lib/medicamentos/tipos";

type Previa = {
  saludo: string;
  fechaTexto: string;
  grupo: Dosis[];
  momento: MomentoDia | null;
  siguientes: Siguiente[];
  porCorregir: PorCorregir[];
  hayMedsHoy: boolean;
  // La lectura de los remedios de hoy falló: no es lo mismo que "no tiene remedios".
  errorMedicamentos?: boolean;
  turno: TurnoSimple | null;
  mediciones: { titulo: string; items: MedicionSimple[] } | null;
};

type ErrorGuardado = { mensaje: string; reintentar: () => void };

const NADA = () => {};

// Cada interruptor aplica al instante (UI optimista) y guarda con una Server
// Action; si falla, vuelve atrás y abre "No pudimos guardar" con Reintentar
// (mismo patrón que Configurar avisos).
// Cola de guardados de la pantalla (un solo configurador abierto a la vez).
let ultimoGuardado: Promise<unknown> = Promise.resolve();
function encolar<T>(tarea: () => Promise<T>): Promise<T> {
  const turno = ultimoGuardado.then(tarea);
  ultimoGuardado = turno.catch(() => undefined);
  return turno;
}

export function ConfigurarModoSimple({
  personaId,
  nombre,
  puedeEditar,
  disponible,
  inicial,
  contacto,
  yo,
  hayTurno,
  hayMediciones,
  previa,
}: {
  personaId: string;
  nombre: string;
  puedeEditar: boolean;
  /** La migración 029 está aplicada (la tabla existe). */
  disponible: boolean;
  inicial: PrefsModoSimple;
  /** Contacto de emergencia cargado en el perfil de la persona. */
  contacto: { nombre: string; telefono: string } | null;
  /** Quien configura, si tiene teléfono cargado en su perfil. */
  yo: { nombre: string; telefono: string } | null;
  hayTurno: boolean;
  hayMediciones: boolean;
  previa: Previa;
}) {
  const [prefs, setPrefs] = useState<PrefsModoSimple>(inicial);
  const [error, setError] = useState<ErrorGuardado | null>(null);
  const [reintentando, setReintentando] = useState(false);
  const [probando, setProbando] = useState(false);
  const bloqueado = !puedeEditar || !disponible;

  // Los guardados se encolan: el servidor lee-mezcla-escribe las preferencias,
  // así que dos guardados en paralelo se pisarían y el último gesto no ganaría.

  async function cambiar(opts: { aplicar: () => void; revertir: () => void; guardar: () => Promise<EstadoModoSimple> }) {
    opts.aplicar();
    let r: EstadoModoSimple;
    try {
      r = await encolar(opts.guardar);
    } catch {
      r = { status: "error", message: "No pudimos guardar tu cambio. Probá de nuevo." };
    }
    if (r.status === "error") {
      opts.revertir();
      setError({
        mensaje: r.message,
        reintentar: () => {
          setReintentando(true);
          void cambiar(opts).finally(() => setReintentando(false));
          setError(null);
        },
      });
    }
  }

  function cambiarPrefs(parche: ParcheModoSimple) {
    const anterior: Record<string, unknown> = {};
    for (const k of Object.keys(parche)) anterior[k] = prefs[k as keyof PrefsModoSimple];
    return cambiar({
      aplicar: () => setPrefs((p) => ({ ...p, ...parche })),
      revertir: () => setPrefs((p) => ({ ...p, ...(anterior as Partial<PrefsModoSimple>) })),
      guardar: () => guardarPrefsModoSimpleAction(personaId, parche),
    });
  }

  const alternar = (clave: ClaveBooleanaMS) => (v: boolean) => void cambiarPrefs({ [clave]: v });

  // A quién llama Ayuda: su contacto de emergencia (default), quien configura, o
  // alguien que otro Admin dejó elegido.
  const llamaA: "contacto" | "yo" | "otro" = !prefs.llamar_telefono
    ? "contacto"
    : yo && prefs.llamar_telefono === yo.telefono
      ? "yo"
      : "otro";
  const opcionesLlamar = [
    { valor: "contacto" as const, etiqueta: "Su contacto" },
    ...(yo ? [{ valor: "yo" as const, etiqueta: yo.nombre }] : []),
    ...(llamaA === "otro" ? [{ valor: "otro" as const, etiqueta: prefs.llamar_nombre ?? "Otro" }] : []),
  ];
  function elegirLlamar(v: "contacto" | "yo" | "otro") {
    if (v === llamaA) return;
    if (v === "contacto") void cambiarPrefs({ llamar_nombre: null, llamar_telefono: null });
    else if (v === "yo" && yo) void cambiarPrefs({ llamar_nombre: yo.nombre, llamar_telefono: yo.telefono });
  }
  const destinoAyuda =
    llamaA === "contacto" ? contacto : { nombre: prefs.llamar_nombre ?? "", telefono: prefs.llamar_telefono ?? "" };

  async function probarVoz() {
    if (probando) return;
    setProbando(true);
    // Dentro del gesto del tap: Safari/iOS bloquea el audio si no.
    desbloquearVoz();
    try {
      const blob = await obtenerAudioBlob(`Hola, ${nombre}. Es hora de tus pastillas de la mañana.`);
      if (!blob) {
        toast.error("No pudimos reproducir la voz de prueba.");
        return;
      }
      await reproducirBlob(blob, prefs.voz_lenta ? VELOCIDAD_VOZ_LENTA : 1);
    } finally {
      setProbando(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <VistaPrevia nombre={nombre} prefs={prefs} previa={previa} contacto={destinoAyuda} />

      {!disponible && (
        <Nota>
          Todavía no se puede cambiar el modo simple desde acá. Mientras tanto {nombre} lo ve completo.
        </Nota>
      )}
      {disponible && !puedeEditar && <Nota>Sos Lector: podés ver cómo está configurado. Solo un Admin lo cambia.</Nota>}

      <fieldset disabled={bloqueado} className="contents">
        <Seccion titulo="Qué ve">
          <Fila label="Remedios" sub="Qué toma ahora y el botón para confirmarlo." fijo />
          <Fila
            label="Turnos"
            sub={hayTurno ? "El turno de hoy o de mañana." : `El turno del día. ${nombre} no tiene turnos hoy ni mañana.`}
            activo={prefs.ver_turnos}
            onChange={alternar("ver_turnos")}
          />
          <Fila
            label="Mediciones"
            sub={hayMediciones ? "Le recuerda medirse el azúcar o la presión." : `Le recuerda medirse el azúcar o la presión. ${nombre} todavía no tiene mediciones cargadas.`}
            activo={prefs.ver_mediciones}
            onChange={alternar("ver_mediciones")}
          />
          <Fila label="Hablar con Vita" sub="Puede preguntarle cosas en voz alta." activo={prefs.charlar} onChange={alternar("charlar")} />
          <Fila
            label="Botón de ayuda urgente"
            sub="Botón rojo arriba: llama a quien elijas."
            activo={prefs.ayuda}
            onChange={alternar("ayuda")}
            extra={
              prefs.ayuda ? (
                <div className="flex flex-col gap-2">
                  <div className="eyebrow text-subtle">A quién llama</div>
                  {opcionesLlamar.length > 1 && (
                    <Segmentado etiqueta="A quién llama" valor={llamaA} onChange={elegirLlamar} opciones={opcionesLlamar} />
                  )}
                  <p className="text-pretty text-[11.5px] font-medium leading-snug text-subtle">
                    {destinoAyuda?.telefono
                      ? `${destinoAyuda.nombre || "Contacto"} · ${destinoAyuda.telefono}`
                      : `${nombre} todavía no tiene un contacto de emergencia cargado: el botón le explica cómo cargarlo.`}
                    {!yo && " Para elegirte a vos, cargá tu teléfono en tu perfil."}
                  </p>
                </div>
              ) : undefined
            }
          />
        </Seccion>

        <Seccion titulo="Lectura en voz alta">
          <Fila
            label="Leerle los avisos"
            sub="Vita lee cada aviso y lo que hay que tomar."
            activo={prefs.voz}
            onChange={alternar("voz")}
            extra={
              prefs.voz ? (
                <div className="flex flex-col gap-3">
                  <Segmentado
                    etiqueta="Velocidad de la voz"
                    valor={prefs.voz_lenta ? "lenta" : "normal"}
                    onChange={(v) => void cambiarPrefs({ voz_lenta: v === "lenta" })}
                    opciones={[
                      { valor: "normal", etiqueta: "Normal" },
                      { valor: "lenta", etiqueta: "Más lenta" },
                    ]}
                  />
                  <button
                    type="button"
                    onClick={probarVoz}
                    disabled={probando}
                    className="flex items-center gap-[7px] self-start rounded-full bg-chip-teal-bg px-3.5 py-[9px] text-[12.5px] font-extrabold text-teal-deep disabled:opacity-60"
                  >
                    <VitaIcon name="volume" size={15} strokeWidth={2.3} />
                    {probando ? "Sonando…" : "Probar la voz"}
                  </button>
                </div>
              ) : undefined
            }
          />
        </Seccion>

        <Seccion titulo="Posponer">
          <Fila
            label="Puede tocar «Más tarde»"
            sub="Si no puede tomarlo justo, le avisamos de nuevo."
            activo={prefs.posponer}
            onChange={alternar("posponer")}
            extra={
              prefs.posponer ? (
                <Segmentado
                  etiqueta="Cuánto después"
                  valor={prefs.posponer_min as number}
                  onChange={(v) => void cambiarPrefs({ posponer_min: v as MinutosPosponer })}
                  opciones={POSPONER_OPCIONES.map((n) => ({ valor: n as number, etiqueta: `${n} min` }))}
                />
              ) : undefined
            }
          />
        </Seccion>
      </fieldset>

      <p className="text-pretty px-1.5 text-[12.5px] font-medium leading-[1.45] text-subtle">
        Los cambios le llegan a su celular al instante. Los remedios siempre se ven.
      </p>

      <ErrorGuardarSheet
        abierto={error !== null}
        detalle={error?.mensaje}
        reintentando={reintentando}
        onReintentar={() => error?.reintentar()}
        onDescartar={() => setError(null)}
      />
    </div>
  );
}

function Nota({ children }: { children: React.ReactNode }) {
  return <p className="text-pretty px-1.5 text-[12.5px] font-semibold leading-[1.45] text-slate-brand">{children}</p>;
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="eyebrow px-0.5 pb-2.5 text-subtle">{titulo}</h2>
      <div className="overflow-hidden rounded-[20px] bg-card shadow-card">{children}</div>
    </section>
  );
}

function Fila({
  label,
  sub,
  activo,
  onChange,
  fijo,
  extra,
}: {
  label: string;
  sub: string;
  activo?: boolean;
  onChange?: (v: boolean) => void;
  /** Siempre activo (Remedios). */
  fijo?: boolean;
  extra?: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-3 px-4 py-[15px] [&:not(:first-child)]:border-t [&:not(:first-child)]:border-foreground/[0.07]")}>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-heading text-[14.5px] font-extrabold tracking-[-0.02em]">{label}</div>
          <div className="mt-0.5 text-pretty text-[11.5px] font-medium leading-snug text-subtle">{sub}</div>
        </div>
        {fijo ? (
          <span className="shrink-0 rounded-full bg-secondary px-2.5 py-[5px] text-[11.5px] font-extrabold text-slate-brand">Siempre</span>
        ) : (
          <Interruptor activo={!!activo} onChange={onChange ?? NADA} label={label} />
        )}
      </div>
      {extra}
    </div>
  );
}

// Vista previa en vivo: las MISMAS piezas que la pantalla de la persona, en un
// marco de 415 px escalado a 0,44. Solo se mira (sin interacción).
function VistaPrevia({
  nombre,
  prefs,
  previa,
  contacto,
}: {
  nombre: string;
  prefs: PrefsModoSimple;
  previa: Previa;
  contacto: { nombre: string; telefono: string } | null;
}) {
  const hayGrupo = previa.grupo.length > 0;
  return (
    <div className="flex flex-col items-center gap-3 overflow-hidden rounded-[24px] bg-secondary px-4 pt-4">
      <div className="eyebrow text-slate-brand">Así lo ve {nombre}</div>
      <div aria-hidden inert className="pointer-events-none mb-4 h-[385px] w-[183px] shrink-0 overflow-hidden rounded-[22px] shadow-card">
        <div className="relative h-[874px] w-[415px] origin-top-left scale-[0.44] overflow-hidden bg-cream">
          <div className="px-5 pt-5">
            <Cabecera
              saludo={previa.saludo}
              nombre={nombre}
              fechaTexto={previa.fechaTexto}
              onAyuda={NADA}
              telefono={contacto?.telefono ?? null}
              contacto={contacto?.nombre ?? null}
              conAyuda={prefs.ayuda}
            />
            <div className="mt-5 flex flex-col gap-4">
              {prefs.ver_turnos && previa.turno && <TarjetaTurno turno={previa.turno} />}
              {previa.errorMedicamentos ? (
                <p className="rounded-[20px] bg-destructive/10 p-4 text-sm text-destructive" role="alert">
                  No pudimos cargar los remedios de hoy. Intentá de nuevo en un momento.
                </p>
              ) : hayGrupo ? (
                <TarjetaGrupo
                  grupo={previa.grupo}
                  momento={previa.momento}
                  alertado={false}
                  confirmando={false}
                  escuchandoVoz={false}
                  silenciada={false}
                  conVoz={prefs.voz}
                  puedePosponer={prefs.posponer}
                  minutosPosponer={prefs.posponer_min}
                  onConfirmar={NADA}
                  onEscuchar={NADA}
                  onPosponer={NADA}
                  onAlternarVoz={NADA}
                />
              ) : (
                <TarjetaDescanso nombre={nombre} hayMedsHoy={previa.hayMedsHoy} proximaHora={previa.siguientes[0]?.horaProgramada} />
              )}
              {prefs.ver_mediciones && previa.mediciones && (
                <TarjetaMediciones titulo={previa.mediciones.titulo} mediciones={previa.mediciones.items} hrefDe={null} />
              )}
              {previa.porCorregir.length > 0 && <TarjetaPorCorregir items={previa.porCorregir} />}
              {previa.siguientes.length > 0 && <TarjetaSiguientes siguientes={previa.siguientes} titulo={hayGrupo ? "Después" : "Próximas tomas"} />}
            </div>
          </div>
          <BarraInferior estado="idle" onHablar={NADA} onAjustes={NADA} conCharla={prefs.charlar} />
        </div>
      </div>
    </div>
  );
}
