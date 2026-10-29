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
import { esTipoMedicion, hrefNuevaMedicion } from "@/lib/mediciones/tipos";
import { desbloquearVoz, cancelarVoz, obtenerAudioBlob, reproducirBlob } from "@/lib/voz/hablar-cliente";
import { useSilencioVita } from "@/lib/voz/usar-silencio";
import { useGrabacionVoz } from "@/lib/voz/usar-grabacion-voz";
import { usePosponer } from "@/lib/modo-simple/usar-posponer";
import { olvidarModoSimple, recordarModoSimple } from "@/lib/modo-simple/recordar";
import { VELOCIDAD_VOZ_LENTA, type PrefsModoSimple } from "@/lib/modo-simple/tipos";
import { BarraSinConexion } from "@/components/vita/barra-sin-conexion";
import { useChatOverlay } from "@/lib/chat/overlay-context";
import { cancelarPosposicionAction, posponerDosisAction } from "@/lib/notificaciones/actions";
import { usePushActivo } from "@/lib/notificaciones/usar-push-activo";
import type { MomentoDia } from "@/lib/medicamentos/tipos";
import {
  BarraInferior,
  Cabecera,
  TarjetaDescanso,
  TarjetaGrupo,
  TarjetaMediciones,
  TarjetaSiguientes,
  TarjetaPorCorregir,
  TarjetaTurno,
  fraseAnuncio,
  listaHablada,
  type Dosis,
  type MedicionSimple,
  type Siguiente,
  type PorCorregir,
  type TurnoSimple,
} from "@/components/vita/modo-simple/piezas";
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

// Cada cuánto se pide un refresh del server component mientras la
// pantalla sigue abierta — así "esperando" pasa solo a "alertado" cuando
// vence el margen de gracia real (recalculado en el servidor con
// esDosisVencida/horaEnAR), sin reimplementar esa cuenta acá.
const INTERVALO_REFRESCO_MS = 45_000;

export function Pantalla({
  nombre,
  saludo,
  fechaTexto,
  grupo,
  momento,
  siguientes,
  porCorregir,
  hayMedsHoy,
  vencida,
  recordatorios,
  config,
  turno,
  mediciones,
  telefonoAyuda,
  nombreAyuda,
}: {
  nombre: string;
  saludo: string;
  fechaTexto: string;
  /** A quién llama Ayuda (Configurar modo simple o contacto de emergencia), o null si no hay. */
  telefonoAyuda: string | null;
  nombreAyuda: string | null;
  /** Qué ve la persona (Configurar modo simple; defaults si no hay fila). */
  config: PrefsModoSimple;
  /** Turno de hoy o de mañana (null = ninguno, o la sección está apagada). */
  turno: TurnoSimple | null;
  /** Presión/azúcar con datos reales (null = nada que mostrar, o la sección está apagada). */
  mediciones: { titulo: string; items: MedicionSimple[] } | null;
  /** Dosis pendientes del momento actual — la tarjeta principal. */
  grupo: Dosis[];
  momento: MomentoDia | null;
  siguientes: Siguiente[];
  /** Pendientes con la hora guardada inválida (no se pueden confirmar). */
  porCorregir: PorCorregir[];
  /** Había medicación programada hoy (distingue "todo tomado" de "nada cargado"). */
  hayMedsHoy: boolean;
  vencida: boolean;
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
  const posponer = usePosponer(grupo.map((m) => m.id).join(","), config.posponer_min);
  const pushActivo = usePushActivo();
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

  // Entrar al modo simple lo deja activo en este dispositivo: si la app se
  // cierra, al abrirla de nuevo vuelve acá y no al Inicio normal.
  useEffect(() => {
    recordarModoSimple();
  }, []);

  async function reproducirAnuncio() {
    if (!hayGrupo || silenciada || !config.voz) return;
    setReproduciendoAudio(true);
    try {
      const blob = await obtenerAudioBlob(fraseAnuncio(grupo, momento));
      await reproducirBlob(blob, config.voz_lenta ? VELOCIDAD_VOZ_LENTA : 1);
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

  // "Más tarde" también se registra en el servidor: así el cron vuelve a mandar
  // el aviso a los 15/30/60 min (los que eligió quien configuró el modo simple) aunque esta pantalla ya no esté abierta. Si el
  // registro falla, el posponer local sigue valiendo (la tarjeta reaparece).
  function posponerAqui() {
    posponer.posponer();
    void posponerDosisAction(grupo.map((m) => m.id), config.posponer_min).catch(() => {});
  }

  function verAhora() {
    posponer.cancelar();
    void cancelarPosposicionAction(grupo.map((m) => m.id)).catch(() => {});
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

  const pendienteDeGesto = (fase === "esperando" || fase === "alertado") && !posponer.posponido && !silenciada && config.voz && !audioDesbloqueado;
  const mostrarTarjeta = (fase === "esperando" || fase === "alertado") && !pendienteDeGesto;

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-cream">
      {fase === "confirmado" ? (
        <FaseConfirmado grupo={grupo} />
      ) : pendienteDeGesto ? (
        <>
          <FaseGesto onTocar={alDesbloquear} estado={estadoAvatar} />
          <BarraInferior estado={estadoAvatar} onHablar={() => abrirChat()} onAjustes={() => setAjustesAbiertos(true)} conCharla={config.charlar} />
        </>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto px-5 pb-[168px] pt-[max(1.25rem,env(safe-area-inset-top))]">
            <BarraSinConexion grande />
            <Cabecera
              saludo={saludo}
              nombre={nombre}
              fechaTexto={fechaTexto}
              onAyuda={() => setAyudaAbierta(true)}
              telefono={telefonoAyuda}
              contacto={nombreAyuda}
              conAyuda={config.ayuda}
            />

            <div className="mt-5 flex flex-col gap-4">
              <ActivarNotificaciones variante="simple" />
              {recordatorios.length > 0 && <AvisoRecordatorio grande items={recordatorios} />}

              {turno && <TarjetaTurno turno={turno} />}

              {fase === "descanso" && <TarjetaDescanso nombre={nombre} hayMedsHoy={hayMedsHoy} proximaHora={siguientes[0]?.horaProgramada} />}

              {mostrarTarjeta && posponer.posponido && (
                <TarjetaPospuesta
                  grupo={grupo}
                  minutos={posponer.minutosRestantes}
                  confirmando={pendiente}
                  onConfirmar={confirmar}
                  onVolver={verAhora}
                  conAviso={pushActivo}
                />
              )}

              {mostrarTarjeta && !posponer.posponido && (
                <TarjetaGrupo
                  grupo={grupo}
                  momento={momento}
                  alertado={fase === "alertado"}
                  confirmando={pendiente}
                  escuchandoVoz={estadoVoz !== "inactivo"}
                  silenciada={silenciada}
                  conVoz={config.voz}
                  puedePosponer={config.posponer}
                  minutosPosponer={config.posponer_min}
                  onConfirmar={confirmar}
                  onEscuchar={alEscuchar}
                  onPosponer={posponerAqui}
                  onAlternarVoz={alternarEscuchaVoz}
                />
              )}

              {mediciones && (
                <TarjetaMediciones
                  titulo={mediciones.titulo}
                  mediciones={mediciones.items}
                  hrefDe={(tipo) => hrefNuevaMedicion({ tipo: esTipoMedicion(tipo) ? tipo : undefined, volver: "/app/modo-simple" })}
                />
              )}

              {porCorregir.length > 0 && <TarjetaPorCorregir items={porCorregir} />}

              {siguientes.length > 0 && <TarjetaSiguientes siguientes={siguientes} titulo={hayGrupo ? "Después" : "Próximas tomas"} />}
            </div>
          </div>
          <BarraInferior estado={estadoAvatar} onHablar={() => abrirChat()} onAjustes={() => setAjustesAbiertos(true)} conCharla={config.charlar} />
        </>
      )}

      <SheetAjustes
        open={ajustesAbiertos}
        onOpenChange={setAjustesAbiertos}
        silenciada={silenciada}
        onAlternarSonido={alternarSonido}
      />
      <SheetAyudaSinContacto open={ayudaAbierta && !telefonoAyuda} onOpenChange={setAyudaAbierta} />
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
  conAviso,
}: {
  grupo: Dosis[];
  minutos: number;
  confirmando: boolean;
  onConfirmar: () => void;
  onVolver: () => void;
  /** Hay un push activo en este celular: el aviso de nuevo llega de verdad. */
  conAviso: boolean;
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
            {conAviso ? "Te aviso de nuevo" : "Te la muestro de nuevo"} en {minutos} min
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
            onClick={olvidarModoSimple}
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
            Cargá el nombre y el teléfono de alguien de confianza en Perfil, en Contacto de emergencia.
            Después, el botón Ayuda lo llama directo.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-3 px-4">
          <Link
            href="/app/perfil/contacto-emergencia"
            className="flex h-14 items-center justify-center rounded-full bg-primary text-[16px] font-extrabold text-primary-foreground"
          >
            Cargar contacto de emergencia
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}
