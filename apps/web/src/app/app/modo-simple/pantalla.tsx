"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { VitaIcon } from "@/lib/vita-icons";
import { VitaAvatar } from "@/components/vita/v-mark";
import type { EstadoAvatar } from "@/components/vita/estados-avatar";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { desbloquearVoz, cancelarVoz, obtenerAudioBlob, reproducirBlob } from "@/lib/voz/hablar-cliente";
import { useSilencioVita } from "@/lib/voz/usar-silencio";
import { useGrabacionVoz } from "@/lib/voz/usar-grabacion-voz";
import { MINUTOS_POSPONER, usePosponer } from "@/lib/modo-simple/usar-posponer";
import { useChatOverlay } from "@/lib/chat/overlay-context";
import { horaCorta } from "@/lib/notificaciones/mensajes";
import type { MomentoDia } from "@/lib/medicamentos/tipos";
import { marcarTomadoAction } from "../rutina/actions";
import { ActivarNotificaciones } from "@/components/vita/activar-notificaciones";
import { AvisoRecordatorio } from "@/components/vita/aviso-recordatorio";

// Coincide EXACTO con el regex del diseño — nunca se toca esta lista de
// palabras sin actualizar también design/tasks.
const CONFIRMACION_POR_VOZ = /\b(s[ií]|tom[eé]|listo|ya est[aá])\b/i;

// Fases del state machine (spec: waiting | confirmed | alerted | resting).
// "confirmado" es transitoria (solo local, nunca viene del servidor): se
// entra al confirmar y se sale sola a los ~2.4s pidiendo un refresh del
// server component, que recalcula el próximo grupo pendiente (u ninguno).
type Fase = "esperando" | "alertado" | "confirmado" | "descanso";

type Dosis = {
  id: string;
  nombre: string;
  dosis: string | null;
  unidad: string;
  horaProgramada: string;
};

type Siguiente = { id: string; nombre: string; horaProgramada: string; momento: MomentoDia };

const UNIDAD_HABLADA: Record<string, string> = {
  mg: "miligramos",
  ml: "mililitros",
  gotas: "gotas",
  UI: "unidades",
  "comp.": "comprimidos",
};

const DEL_MOMENTO: Record<MomentoDia, string> = {
  "mañana": "de la mañana",
  mediodia: "del mediodía",
  tarde: "de la tarde",
  noche: "de la noche",
};

const ICONO_MOMENTO: Record<MomentoDia, string> = {
  "mañana": "sunrise",
  mediodia: "sun",
  tarde: "sunset",
  noche: "moon",
};

function listaHablada(nombres: string[]): string {
  if (nombres.length <= 1) return nombres[0] ?? "";
  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

function fraseAnuncio(grupo: Dosis[], momento: MomentoDia | null): string {
  if (grupo.length === 1) {
    const p = grupo[0];
    const unidadTexto = UNIDAD_HABLADA[p.unidad] ?? p.unidad;
    const dosisTexto = p.dosis ? `, ${p.dosis} ${unidadTexto}` : "";
    return `Es hora de tomar ${p.nombre}${dosisTexto}.`;
  }
  const cuando = momento ? ` ${DEL_MOMENTO[momento]}` : "";
  return `Es hora de tomar tus ${grupo.length} pastillas${cuando}: ${listaHablada(grupo.map((p) => p.nombre))}.`;
}

function tituloGrupo(n: number, momento: MomentoDia | null): string {
  const cuando = momento ? ` ${DEL_MOMENTO[momento]}` : "";
  return n === 1 ? `Tu pastilla${cuando}` : `Tus ${n} pastillas${cuando}`;
}

// Cada cuánto se pide un refresh del server component mientras la
// pantalla sigue abierta — así "esperando" pasa solo a "alertado" cuando
// vence el margen de gracia real (recalculado en el servidor con
// esDosisVencida/horaEnAR), sin reimplementar esa cuenta acá.
const INTERVALO_REFRESCO_MS = 45_000;

export function Pantalla({
  nombre,
  saludo,
  fechaTexto,
  telefonoEmergencia,
  nombreEmergencia,
  grupo,
  momento,
  siguientes,
  hayMedsHoy,
  vencida,
  faltanMinutos,
  recordatorios,
}: {
  nombre: string;
  saludo: string;
  fechaTexto: string;
  /** Teléfono del contacto de emergencia (perfiles), o null si no hay. */
  telefonoEmergencia: string | null;
  nombreEmergencia: string | null;
  /** Dosis pendientes del momento actual — la tarjeta principal. */
  grupo: Dosis[];
  momento: MomentoDia | null;
  siguientes: Siguiente[];
  /** Había medicación programada hoy (distingue "todo tomado" de "nada cargado"). */
  hayMedsHoy: boolean;
  vencida: boolean;
  faltanMinutos: number;
  /** Un familiar le recordó estas dosis (aviso tranquilo, sin sonido). */
  recordatorios: { medicamentoId: string; nombre: string; horaProgramada: string }[];
}) {
  const router = useRouter();
  // esperando/alertado/descanso se derivan directo de las props en cada
  // render — nunca se guardan en useState, así el refresco periódico (que
  // trae un nuevo `vencida` para el MISMO grupo; un cambio de grupo
  // siempre remonta este componente entero vía key en el padre) se
  // refleja solo, sin un efecto sincronizando estado derivado.
  // "confirmado" es la única fase que sí necesita estado local: es
  // puramente transitoria y nunca la manda el servidor.
  const [confirmadoLocal, setConfirmadoLocal] = useState(false);
  const hayGrupo = grupo.length > 0;
  const fase: Fase = confirmadoLocal ? "confirmado" : !hayGrupo ? "descanso" : vencida ? "alertado" : "esperando";
  const { silenciada, alternar: alternarSilencio } = useSilencioVita();
  const { abrir: abrirChat } = useChatOverlay();
  const posponer = usePosponer(grupo.map((m) => m.id).join(","));
  const [audioDesbloqueado, setAudioDesbloqueado] = useState(false);
  const [ajustesAbiertos, setAjustesAbiertos] = useState(false);
  const [ayudaAbierta, setAyudaAbierta] = useState(false);
  const [pendiente, startTransition] = useTransition();
  // Para que el avatar muestre "speaking" mientras suena el anuncio por voz
  // — reproducirAnuncio ya esperaba el audio entero, esto solo expone esa
  // ventana como estado visible.
  const [reproduciendoAudio, setReproduciendoAudio] = useState(false);

  useEffect(() => {
    const id = setInterval(() => router.refresh(), INTERVALO_REFRESCO_MS);
    return () => clearInterval(id);
  }, [router]);

  async function reproducirAnuncio() {
    if (!hayGrupo || silenciada) return;
    setReproduciendoAudio(true);
    try {
      const blob = await obtenerAudioBlob(fraseAnuncio(grupo, momento));
      await reproducirBlob(blob);
    } finally {
      setReproduciendoAudio(false);
    }
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

  // "Escuchar" de la tarjeta: también es un gesto del usuario, así que
  // vuelve a desbloquear antes de cualquier await.
  function alEscuchar() {
    desbloquearVoz();
    setAudioDesbloqueado(true);
    void reproducirAnuncio();
  }

  function confirmar() {
    if (!hayGrupo || pendiente) return;
    startTransition(async () => {
      try {
        // Cada dosis del grupo se marca con la misma acción de siempre
        // (marcarTomado) — no hay un camino de escritura paralelo.
        const resultados = await Promise.all(grupo.map((m) => marcarTomadoAction(m.id, true)));
        if (resultados.some((r) => r.status === "error")) {
          // Puede haberse registrado solo una parte: se vuelve a leer del
          // servidor para que la pantalla muestre lo que realmente quedó.
          toast.error("No se pudo registrar toda la toma. Probá de nuevo.");
          router.refresh();
          return;
        }
        posponer.cancelar();
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

  // Silenciar corta en el mismo click: audio en curso y micrófono.
  function alternarSonido() {
    if (!silenciada) {
      cancelarVoz();
      detenerVoz();
      setReproduciendoAudio(false);
    }
    alternarSilencio();
  }

  async function alternarEscuchaVoz() {
    if (silenciada) return;
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

  // Prioridad igual que en el chat (vita-chat-overlay.tsx): lo que está
  // pasando AHORA (hablando el anuncio > escuchando la confirmación por
  // voz) le gana a la fase de fondo. "alertado" usa "alert" — es
  // literalmente el caso que el brief define como esa expresión ("existe
  // información que requiere especial atención"), una dosis vencida.
  const estadoAvatar: EstadoAvatar = reproduciendoAudio
    ? "speaking"
    : estadoVoz === "grabando" || estadoVoz === "escuchando"
      ? "listening"
      : estadoVoz === "procesando"
        ? "thinking"
        : fase === "alertado"
          ? "alert"
          : fase === "confirmado"
            ? "happy"
            : fase === "descanso"
              ? "calm"
              : "idle";

  const pendienteDeGesto = (fase === "esperando" || fase === "alertado") && !posponer.posponido && !silenciada && !audioDesbloqueado;
  const mostrarTarjeta = (fase === "esperando" || fase === "alertado") && !pendienteDeGesto;

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-cream">
      {fase === "confirmado" ? (
        <FaseConfirmado grupo={grupo} />
      ) : pendienteDeGesto ? (
        <>
          <FaseGesto onTocar={alDesbloquear} estado={estadoAvatar} />
          <BarraInferior estado={estadoAvatar} onHablar={() => abrirChat()} onAjustes={() => setAjustesAbiertos(true)} />
        </>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto px-5 pb-[168px] pt-[max(1.25rem,env(safe-area-inset-top))]">
            <Cabecera
              saludo={saludo}
              nombre={nombre}
              fechaTexto={fechaTexto}
              onAyuda={() => setAyudaAbierta(true)}
              telefono={telefonoEmergencia}
              contacto={nombreEmergencia}
            />

            <div className="mt-5 flex flex-col gap-4">
              <ActivarNotificaciones variante="simple" />
              {recordatorios.length > 0 && <AvisoRecordatorio grande items={recordatorios} />}

              {fase === "descanso" && <TarjetaDescanso nombre={nombre} hayMedsHoy={hayMedsHoy} />}

              {mostrarTarjeta && posponer.posponido && (
                <TarjetaPospuesta
                  grupo={grupo}
                  minutos={posponer.minutosRestantes}
                  confirmando={pendiente}
                  onConfirmar={confirmar}
                  onVolver={posponer.cancelar}
                />
              )}

              {mostrarTarjeta && !posponer.posponido && (
                <TarjetaGrupo
                  grupo={grupo}
                  momento={momento}
                  alertado={fase === "alertado"}
                  faltanMinutos={faltanMinutos}
                  confirmando={pendiente}
                  escuchandoVoz={estadoVoz !== "inactivo"}
                  silenciada={silenciada}
                  onConfirmar={confirmar}
                  onEscuchar={alEscuchar}
                  onPosponer={posponer.posponer}
                  onAlternarVoz={alternarEscuchaVoz}
                />
              )}

              {siguientes.length > 0 && <TarjetaSiguientes siguientes={siguientes} />}
            </div>
          </div>
          <BarraInferior estado={estadoAvatar} onHablar={() => abrirChat()} onAjustes={() => setAjustesAbiertos(true)} />
        </>
      )}

      <SheetAjustes
        open={ajustesAbiertos}
        onOpenChange={setAjustesAbiertos}
        silenciada={silenciada}
        onAlternarSonido={alternarSonido}
      />
      <SheetAyudaSinContacto open={ayudaAbierta && !telefonoEmergencia} onOpenChange={setAyudaAbierta} />
    </div>
  );
}

// Encabezado V7: fecha + "Buen día, {nombre}" y el botón rojo "Ayuda". Con
// contacto de emergencia cargado es un link `tel:` (llama directo); sin él
// abre una hoja que explica dónde cargarlo.
function Cabecera({
  saludo,
  nombre,
  fechaTexto,
  telefono,
  contacto,
  onAyuda,
}: {
  saludo: string;
  nombre: string;
  fechaTexto: string;
  telefono: string | null;
  contacto: string | null;
  onAyuda: () => void;
}) {
  const clasesAyuda =
    "flex h-[58px] shrink-0 items-center gap-2 rounded-full bg-destructive px-5 text-[19px] font-extrabold text-primary-foreground shadow-[0_8px_20px_color-mix(in_srgb,var(--destructive)_32%,transparent)] transition-transform active:scale-[0.96] motion-reduce:transition-none";
  const telLimpio = telefono?.replace(/[^\d+]/g, "");

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-[17px] font-semibold capitalize text-slate-brand">{fechaTexto}</div>
        <h1 className="mt-1 font-heading text-[36px] font-extrabold leading-[1.05] tracking-[-0.04em]">
          {saludo}
          {nombre ? "," : ""}
          {nombre && (
            <>
              <br />
              {nombre}
            </>
          )}
        </h1>
      </div>
      {telLimpio ? (
        <a href={`tel:${telLimpio}`} aria-label={contacto ? `Pedir ayuda: llamar a ${contacto}` : "Pedir ayuda: llamar a tu contacto de emergencia"} className={clasesAyuda}>
          <VitaIcon name="alert-triangle" size={24} strokeWidth={2.4} />
          Ayuda
        </a>
      ) : (
        <button type="button" onClick={onAyuda} className={clasesAyuda}>
          <VitaIcon name="alert-triangle" size={24} strokeWidth={2.4} />
          Ayuda
        </button>
      )}
    </div>
  );
}

function BotonEscuchar({ onEscuchar }: { onEscuchar: () => void }) {
  return (
    <button
      type="button"
      onClick={onEscuchar}
      className="flex shrink-0 flex-col items-center gap-0.5 rounded-[var(--radius-item)] bg-persona-1-tint px-3.5 py-2.5 text-teal-deep transition-transform active:scale-[0.96] motion-reduce:transition-none"
    >
      <VitaIcon name="volume" size={26} strokeWidth={2.2} />
      <span className="text-[14px] font-extrabold">Escuchar</span>
    </button>
  );
}

// Slot de la foto de la pastilla — todavía no hay dónde guardarla, así que es
// un placeholder (ícono) con el borde punteado del diseño.
function SlotFoto() {
  return (
    <div
      aria-hidden
      className="flex size-[84px] shrink-0 items-center justify-center rounded-[var(--radius-item)] border border-dashed border-faint bg-secondary text-faint"
    >
      <VitaIcon name="pill" size={30} />
    </div>
  );
}

function TarjetaGrupo({
  grupo,
  momento,
  alertado,
  faltanMinutos,
  confirmando,
  escuchandoVoz,
  silenciada,
  onConfirmar,
  onEscuchar,
  onPosponer,
  onAlternarVoz,
}: {
  grupo: Dosis[];
  momento: MomentoDia | null;
  alertado: boolean;
  faltanMinutos: number;
  confirmando: boolean;
  escuchandoVoz: boolean;
  silenciada: boolean;
  onConfirmar: () => void;
  onEscuchar: () => void;
  onPosponer: () => void;
  onAlternarVoz: () => void;
}) {
  const n = grupo.length;
  return (
    <div className="rounded-[28px] bg-card p-5 shadow-card">
      {alertado ? (
        <div className="eyebrow mb-1.5 flex items-center gap-1.5 text-aviso-ink">
          <VitaIcon name="alert-triangle" size={14} strokeWidth={2.6} /> Todavía no confirmaste
        </div>
      ) : (
        faltanMinutos > 0 && <div className="eyebrow mb-1.5 text-subtle">En {faltanMinutos} min</div>
      )}
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-heading text-[28px] font-extrabold leading-[1.1] tracking-[-0.035em] text-balance">
          {tituloGrupo(n, momento)}
        </h2>
        {!silenciada && <BotonEscuchar onEscuchar={onEscuchar} />}
      </div>

      <ul className="mt-4 flex flex-col gap-3">
        {grupo.map((m) => (
          <li key={m.id} className="flex items-center gap-4">
            <SlotFoto />
            <div className="min-w-0">
              <div className="font-heading text-[26px] font-extrabold leading-tight tracking-[-0.03em]">{m.nombre}</div>
              <div className="mt-0.5 text-[15px] font-semibold text-subtle">
                {[m.dosis && `${m.dosis} ${m.unidad}`, `${horaCorta(m.horaProgramada)} hs`].filter(Boolean).join(" · ")}
              </div>
            </div>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={onConfirmar}
        disabled={confirmando}
        className="mt-5 flex h-[76px] w-full items-center justify-center gap-3 rounded-full bg-teal-deep text-[24px] font-extrabold text-primary-foreground shadow-[0_14px_28px_color-mix(in_srgb,var(--teal-deep)_32%,transparent)] transition-transform active:scale-[0.98] disabled:opacity-70 motion-reduce:transition-none"
      >
        <VitaIcon name="check" size={32} strokeWidth={3} />
        {n === 1 ? "Ya la tomé" : `Ya tomé las ${n}`}
      </button>
      <button
        type="button"
        onClick={onPosponer}
        disabled={confirmando}
        className="mt-3 flex h-[64px] w-full items-center justify-center gap-2.5 rounded-full border-2 border-foreground/10 bg-card text-[19px] font-extrabold transition-transform active:scale-[0.98] disabled:opacity-70 motion-reduce:transition-none"
      >
        <VitaIcon name="clock" size={24} strokeWidth={2.4} />
        Más tarde · en {MINUTOS_POSPONER} min
      </button>
      {!silenciada && (
        <button
          type="button"
          onClick={onAlternarVoz}
          className={cn(
            "mt-3 flex h-[56px] w-full items-center justify-center gap-2 rounded-full text-[16px] font-bold text-teal-deep",
            escuchandoVoz ? "bg-persona-1-tint" : "bg-secondary"
          )}
        >
          <VitaIcon name="mic" size={19} />
          {escuchandoVoz ? "Escuchando…" : "Tocá y decí \"sí\""}
        </button>
      )}
    </div>
  );
}

// Tarjeta mientras la dosis está pospuesta: no se pierde, se puede confirmar
// igual, y "Ver ahora" cancela la espera.
function TarjetaPospuesta({
  grupo,
  minutos,
  confirmando,
  onConfirmar,
  onVolver,
}: {
  grupo: Dosis[];
  minutos: number;
  confirmando: boolean;
  onConfirmar: () => void;
  onVolver: () => void;
}) {
  const n = grupo.length;
  return (
    <div className="rounded-[28px] bg-card p-5 shadow-card">
      <div className="flex items-center gap-4">
        <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-persona-1-tint text-teal-deep">
          <VitaIcon name="clock" size={32} strokeWidth={2.4} />
        </div>
        <div>
          <div className="font-heading text-[24px] font-extrabold leading-tight tracking-[-0.03em]">
            Te aviso de nuevo en {minutos} min
          </div>
          <div className="mt-0.5 text-[15px] font-semibold text-subtle">{listaHablada(grupo.map((m) => m.nombre))}</div>
        </div>
      </div>
      <button
        type="button"
        onClick={onConfirmar}
        disabled={confirmando}
        className="mt-5 flex h-[72px] w-full items-center justify-center gap-3 rounded-full bg-teal-deep text-[22px] font-extrabold text-primary-foreground shadow-[0_14px_28px_color-mix(in_srgb,var(--teal-deep)_32%,transparent)] disabled:opacity-70"
      >
        <VitaIcon name="check" size={30} strokeWidth={3} />
        {n === 1 ? "Ya la tomé" : `Ya tomé las ${n}`}
      </button>
      <button
        type="button"
        onClick={onVolver}
        className="mt-3 flex h-[52px] w-full items-center justify-center rounded-full bg-secondary text-[16px] font-bold text-slate-brand"
      >
        Verlas ahora
      </button>
    </div>
  );
}

function TarjetaSiguientes({ siguientes }: { siguientes: Siguiente[] }) {
  return (
    <section>
      <h2 className="eyebrow px-1 pb-2 text-subtle">Después</h2>
      <ul className="overflow-hidden rounded-[var(--radius-card)] bg-card shadow-card">
        {siguientes.map((s) => (
          <li key={s.id} className="flex items-center gap-3.5 px-4 py-3.5 [&:not(:first-child)]:border-t [&:not(:first-child)]:border-foreground/[0.06]">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-[var(--radius-tile)] bg-persona-1-tint text-teal-deep">
              <VitaIcon name={ICONO_MOMENTO[s.momento]} size={24} />
            </div>
            <div className="min-w-0">
              <div className="font-heading text-[19px] font-extrabold tracking-[-0.025em]">{s.nombre}</div>
              <div className="text-[14px] font-semibold text-subtle">
                A las {horaCorta(s.horaProgramada)} {DEL_MOMENTO[s.momento]}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TarjetaDescanso({ nombre, hayMedsHoy }: { nombre: string; hayMedsHoy: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[28px] bg-card px-6 py-9 text-center shadow-card">
      <div className="flex size-20 items-center justify-center rounded-full bg-persona-1-tint text-teal-deep">
        <VitaIcon name="check" size={40} strokeWidth={3} />
      </div>
      <div className="font-heading text-[26px] font-extrabold leading-tight tracking-[-0.035em]">
        {hayMedsHoy ? `Tomaste todo hoy${nombre ? `, ${nombre}` : ""}` : "Hoy no tenés medicación pendiente"}
      </div>
      <div className="text-[16px] font-medium text-subtle">Te vamos a avisar cuando sea la hora.</div>
    </div>
  );
}

// vita protagonista también acá (es la primera pantalla que ve la persona
// mayor), con un parlante chico como pista de que al tocar va a hablar.
function FaseGesto({ onTocar, estado }: { onTocar: () => void; estado: EstadoAvatar }) {
  return (
    <button
      type="button"
      onClick={onTocar}
      className="flex flex-1 flex-col items-center justify-center gap-4 px-8 pb-28 text-center"
    >
      <div className="relative">
        <VitaAvatar size={180} estado={estado} />
        <div className="absolute -bottom-1 right-2 flex size-14 items-center justify-center rounded-full bg-persona-1-tint text-teal-deep shadow-card">
          <VitaIcon name="volume" size={26} />
        </div>
      </div>
      <div className="font-heading text-[28px] font-extrabold tracking-[-0.03em]">Tocá para escuchar</div>
      <div className="text-[16px] font-medium text-subtle">vita te va a leer tu medicación</div>
    </button>
  );
}

function FaseConfirmado({ grupo }: { grupo: Dosis[] }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-teal-deep px-8 text-center text-primary-foreground">
      <div className="flex size-24 items-center justify-center rounded-full bg-primary-foreground/20">
        <VitaIcon name="check" size={44} color="var(--primary-foreground)" />
      </div>
      <div className="font-heading text-[32px] font-extrabold tracking-[-0.03em]">¡Muy bien!</div>
      <div className="text-[18px] opacity-90">
        {grupo.length === 1
          ? `Registramos que tomaste ${grupo[0].nombre}`
          : `Registramos tus ${grupo.length} pastillas: ${listaHablada(grupo.map((m) => m.nombre))}`}
      </div>
    </div>
  );
}

// Barra inferior V7: "Ajustes" a la izquierda y, al centro, "Hablar con Vita"
// con la mascota (abre el chat, que ya tiene el modo voz).
function BarraInferior({
  estado,
  onHablar,
  onAjustes,
}: {
  estado: EstadoAvatar;
  onHablar: () => void;
  onAjustes: () => void;
}) {
  return (
    <div
      className="absolute inset-x-3 bottom-0 z-10"
      style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
    >
      <div className="relative flex h-[88px] items-end justify-between rounded-[28px] bg-card px-5 pb-3 shadow-nav">
        <button
          type="button"
          onClick={onAjustes}
          className="flex flex-col items-center gap-1 transition-transform active:scale-[0.95] motion-reduce:transition-none"
        >
          <span className="flex size-11 items-center justify-center rounded-full bg-secondary text-slate-brand">
            <VitaIcon name="settings" size={24} />
          </span>
          <span className="text-[13px] font-extrabold text-slate-brand">Ajustes</span>
        </button>
        <button
          type="button"
          onClick={onHablar}
          className="absolute left-1/2 top-[-34px] flex -translate-x-1/2 flex-col items-center gap-1 transition-transform active:scale-[0.95] motion-reduce:transition-none"
        >
          <span className="flex size-[76px] items-center justify-center overflow-hidden rounded-full bg-card shadow-nav ring-[3px] ring-primary">
            <VitaAvatar size={64} estado={estado} interactivo={false} />
          </span>
          <span className="whitespace-nowrap font-heading text-[17px] font-extrabold tracking-[-0.02em]">Hablar con Vita</span>
        </button>
        <span className="w-11" aria-hidden />
      </div>
    </div>
  );
}

function SheetAjustes({
  open,
  onOpenChange,
  silenciada,
  onAlternarSonido,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  silenciada: boolean;
  onAlternarSonido: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-[28px] pb-8">
        <SheetHeader>
          <SheetTitle>Ajustes</SheetTitle>
          <SheetDescription>Cómo querés que te hable vita.</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-3 px-4">
          {/* Preferencia de sonido (compartida con el chat). Texto + ícono,
              nunca solo color; objetivo táctil >= 44px porque esta pantalla
              la usan adultos mayores. */}
          <button
            type="button"
            onClick={onAlternarSonido}
            aria-pressed={silenciada}
            className={cn(
              "flex min-h-14 items-center gap-3 rounded-[var(--radius-item)] px-4 text-left text-[16px] font-extrabold",
              silenciada ? "bg-aviso-tint text-aviso-ink" : "bg-persona-1-tint text-teal-deep"
            )}
          >
            <VitaIcon name={silenciada ? "volume-off" : "volume"} size={24} />
            {silenciada ? "Sonido: desactivado" : "Sonido: activado"}
          </button>
          {/* Salida presente siempre: dejar a alguien sin salida mientras hay
              una dosis pendiente (que puede durar todo el día) convertiría
              esto en una pantalla sin retorno real. */}
          <Link
            href="/app/perfil"
            className="flex min-h-14 items-center gap-3 rounded-[var(--radius-item)] bg-secondary px-4 text-[16px] font-extrabold text-slate-brand"
          >
            <VitaIcon name="logout" size={24} />
            Salir del modo simple
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SheetAyudaSinContacto({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-[28px] pb-8">
        <SheetHeader>
          <SheetTitle>Todavía no cargaste a quién llamar</SheetTitle>
          <SheetDescription>
            Cargá el nombre y el teléfono de alguien de confianza en tu Resumen de salud, en Contacto de emergencia.
            Después, el botón Ayuda lo llama directo.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-3 px-4">
          <Link
            href="/app/resumen-salud"
            className="flex h-14 items-center justify-center rounded-full bg-primary text-[16px] font-extrabold text-primary-foreground"
          >
            Cargar contacto de emergencia
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}
