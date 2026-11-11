"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { VitaIcon } from "@/lib/vita-icons";
import { useRefrescoPeriodico } from "@/components/vita/refresco-periodico";
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
import { volverAMiPerfilAction } from "@/app/app/familia/actions";
import { VELOCIDAD_VOZ_LENTA, type PrefsModoSimple } from "@/lib/modo-simple/tipos";
import { BarraSinConexion } from "@/components/vita/barra-sin-conexion";
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
import { marcarGrupoNoTomadoAction, marcarGrupoTomadoAction } from "../rutina/actions";
import { confirmoPorVoz } from "@/lib/modo-simple/confirmacion-voz";
import { ActivarNotificaciones } from "@/components/vita/activar-notificaciones";
import { AvisoRecordatorio } from "@/components/vita/aviso-recordatorio";
import type { MedHoy, TurnoProximo } from "@/lib/modo-simple/respuestas";
import { CharlaSimple } from "./charla-simple";

// La confirmación por voz se aparta a propósito del regex del diseño: ese no
// entendía "sí" con tilde y confirmaba "no sé si la tomé" (ver confirmacion-voz.ts).

// Fases del state machine (spec: waiting | confirmed | alerted | resting).
// "confirmado" es transitoria (solo local, nunca viene del servidor): se
// entra al confirmar y se sale sola a los ~6 s (tiempo para "Me equivoqué") pidiendo un refresh del
// server component, que recalcula el próximo grupo pendiente (u ninguno).
type Fase = "esperando" | "alertado" | "confirmado" | "descanso";


export function Pantalla({
  usuarioId,
  nombre,
  saludo,
  fechaTexto,
  grupo,
  momento,
  siguientes,
  porCorregir,
  hayMedsHoy,
  vencida,
  fechaDosis = null,
  recordatorios,
  config,
  turno,
  mediciones,
  turnoProximo,
  medsHoy,
  telefonoAyuda,
  nombreAyuda,
}: {
  /** Cuenta logueada: el modo simple queda recordado solo para ella. */
  usuarioId: string;
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
  /** Próximo turno (cualquier día) para la respuesta hablada de la charla; null = ninguno o sección apagada. */
  turnoProximo: TurnoProximo | null;
  /** Medicación de hoy con su estado, para las respuestas locales de la charla. */
  medsHoy: MedHoy[];
  /** Dosis pendientes del momento actual — la tarjeta principal. */
  grupo: Dosis[];
  momento: MomentoDia | null;
  siguientes: Siguiente[];
  /** Pendientes con la hora guardada inválida (no se pueden confirmar). */
  porCorregir: PorCorregir[];
  /** Había medicación programada hoy (distingue "todo tomado" de "nada cargado"). */
  hayMedsHoy: boolean;
  vencida: boolean;
  /** Fecha de AYER cuando el grupo son dosis de ayer en la ventana de medianoche; si no, null. */
  fechaDosis?: string | null;
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
  const [guardado, setGuardado] = useState(false);
  const [preguntarNo, setPreguntarNo] = useState(false);
  const hayGrupo = grupo.length > 0;
  const fase: Fase = confirmadoLocal ? "confirmado" : !hayGrupo ? "descanso" : vencida ? "alertado" : "esperando";
  const { silenciada, alternar: alternarSilencio } = useSilencioVita();
  const [charlaAbierta, setCharlaAbierta] = useState(false);
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

  // Así "esperando" pasa solo a "alertado" cuando vence el margen de gracia
  // real, recalculado en el servidor (esDosisVencida/horaEnAR).
  useRefrescoPeriodico();

  // Entrar al modo simple lo deja activo en este dispositivo: si la app se
  // cierra, al abrirla de nuevo vuelve acá y no al Inicio normal.
  useEffect(() => {
    recordarModoSimple(usuarioId);
  }, [usuarioId]);

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
    if (!hayGrupo || pendiente || confirmadoLocal) return;
    // "¡Listo!" al instante (optimista): el servidor guarda por detrás y, si
    // falla, se vuelve atrás con el aviso.
    setConfirmadoLocal(true);
    posponer.cancelar();
    startTransition(async () => {
      try {
        // Todo el grupo en una sola acción (usa marcarTomado por dentro: no
        // hay un camino de escritura paralelo).
        const resultado = await marcarGrupoTomadoAction(grupo.map((m) => m.id), true, fechaDosis ?? undefined);
        if (resultado.status === "error") {
          // Puede haberse registrado solo una parte: se vuelve a leer del
          // servidor para que la pantalla muestre lo que realmente quedó.
          setConfirmadoLocal(false);
          toast.error("No se pudo registrar toda la toma. Probá de nuevo.");
          router.refresh();
          return;
        }
        setGuardado(true);
      } catch {
        setConfirmadoLocal(false);
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

  // "No la tomé": se pregunta antes (no se deshace desde acá) y deja de pedirla
  // hoy. El cuidador se entera en el resumen de la noche, no en el momento.
  function noTome() {
    setPreguntarNo(false);
    posponer.cancelar();
    startTransition(async () => {
      try {
        const r = await marcarGrupoNoTomadoAction(grupo.map((m) => m.id), fechaDosis ?? undefined);
        if (r.status === "error") {
          toast.error(r.message);
          return;
        }
        toast.success("Listo. No te la vuelvo a pedir hoy.");
        router.refresh();
      } catch {
        toast.error("No se pudo guardar. Probá de nuevo o avisale a tu familia.");
      }
    });
  }

  // "Me equivoqué": vuelve a la tarjeta enseguida y desmarca en el servidor.
  // Next encola las acciones, así que corre después de la confirmación aunque
  // esa todavía no haya terminado.
  function deshacer() {
    setConfirmadoLocal(false);
    setGuardado(false);
    void marcarGrupoTomadoAction(grupo.map((m) => m.id), false, fechaDosis ?? undefined)
      .then((r) => {
        if (r.status === "error") toast.error("No se pudo deshacer. Avisale a tu familia.");
      })
      .catch(() => toast.error("No se pudo deshacer. Avisale a tu familia."))
      .finally(() => router.refresh());
  }

  // Se refresca recién cuando el servidor confirmó (si no, podría traer la
  // dosis todavía sin marcar). Unos segundos, para dar tiempo a "Me equivoqué".
  useEffect(() => {
    if (!guardado) return;
    const t = setTimeout(() => router.refresh(), 6000);
    return () => clearTimeout(t);
  }, [guardado, router]);

  const { estado: estadoVoz, iniciar: iniciarVoz, detener: detenerVoz } = useGrabacionVoz({
    onTranscripcion: (texto) => {
      if (confirmoPorVoz(texto)) {
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

  // La charla de voz tiene el micrófono para ella: se corta cualquier escucha de confirmación y el anuncio.
  function abrirCharla() {
    desbloquearVoz();
    cancelarVoz();
    detenerVoz();
    setReproduciendoAudio(false);
    setCharlaAbierta(true);
  }

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
        <FaseConfirmado grupo={grupo} onDeshacer={deshacer} />
      ) : pendienteDeGesto ? (
        <>
          <FaseGesto onTocar={alDesbloquear} estado={estadoAvatar} />
          <BarraInferior estado={estadoAvatar} onHablar={abrirCharla} onAjustes={() => setAjustesAbiertos(true)} conCharla={config.charlar} />
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
                  deAyer={!!fechaDosis}
                  onNoTome={() => setPreguntarNo(true)}
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
                  hrefDe={(tipo) => hrefNuevaMedicion({ tipo: esTipoMedicion(tipo) ? tipo : undefined, volver: "/app/modo-simple", ahora: true })}
                />
              )}

              {porCorregir.length > 0 && <TarjetaPorCorregir items={porCorregir} />}

              {siguientes.length > 0 && <TarjetaSiguientes siguientes={siguientes} titulo={hayGrupo ? "Después" : "Próximas tomas"} />}
            </div>
          </div>
          <BarraInferior estado={estadoAvatar} onHablar={abrirCharla} onAjustes={() => setAjustesAbiertos(true)} conCharla={config.charlar} />
        </>
      )}

      <SheetAjustes
        open={ajustesAbiertos}
        onOpenChange={setAjustesAbiertos}
        silenciada={silenciada}
        onAlternarSonido={alternarSonido}
      />
      <SheetAyudaSinContacto open={ayudaAbierta && !telefonoAyuda} onOpenChange={setAyudaAbierta} />
      <SheetNoTome open={preguntarNo} onOpenChange={setPreguntarNo} cuantas={grupo.length} onSi={noTome} />
      {charlaAbierta && (
        <CharlaSimple
          nombre={nombre}
          config={config}
          medsHoy={medsHoy}
          turnoProximo={turnoProximo}
          onCerrar={() => setCharlaAbierta(false)}
          telefonoAyuda={telefonoAyuda}
          nombreAyuda={nombreAyuda}
          onAyudaSinContacto={() => setAyudaAbierta(true)}
        />
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

function FaseConfirmado({ grupo, onDeshacer }: { grupo: Dosis[]; onDeshacer: () => void }) {
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
      <button
        type="button"
        onClick={onDeshacer}
        className="mt-6 min-h-14 rounded-full border-2 border-primary-foreground/60 px-6 text-[18px] font-bold text-primary-foreground transition-transform active:scale-[0.98] motion-reduce:transition-none"
      >
        {grupo.length === 1 ? "Me equivoqué, no la tomé" : "Me equivoqué, no las tomé"}
      </button>
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
          <EnlaceAMiCuenta
            href="/app/perfil"
            alNavegar={olvidarModoSimple}
            className="flex min-h-14 items-center gap-3 rounded-[var(--radius-item)] bg-secondary px-4 text-[16px] font-extrabold text-slate-brand"
          >
            <VitaIcon name="logout" size={24} />
            Salir del modo simple
          </EnlaceAMiCuenta>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// El modo simple es siempre de la cuenta logueada. Si el perfil activo era otra
// persona (un Lector en vista de solo mirar bloquea /app/perfil/*), antes de ir
// a Perfil se vuelve al propio, para que el destino sea el de la cuenta correcta.
function EnlaceAMiCuenta({
  href,
  alNavegar,
  className,
  children,
}: {
  href: string;
  alNavegar?: () => void;
  className: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <a
      href={href}
      className={className}
      onClick={async (e) => {
        e.preventDefault();
        alNavegar?.();
        await volverAMiPerfilAction().catch(() => null);
        router.push(href);
      }}
    >
      {children}
    </a>
  );
}

function SheetNoTome({ open, onOpenChange, cuantas, onSi }: { open: boolean; onOpenChange: (v: boolean) => void; cuantas: number; onSi: () => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-[28px] pb-8">
        <SheetHeader>
          <SheetTitle className="text-[24px]">{cuantas === 1 ? "¿Hoy no la vas a tomar?" : "¿Hoy no las vas a tomar?"}</SheetTitle>
          <SheetDescription className="text-[17px]">No te la vuelvo a pedir hoy. A la noche se lo cuento a tu familia.</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-3 px-4">
          <button type="button" onClick={onSi} className="flex h-16 items-center justify-center rounded-full bg-teal-deep text-[20px] font-extrabold text-primary-foreground">
            {cuantas === 1 ? "Sí, hoy no la tomo" : "Sí, hoy no las tomo"}
          </button>
          <button type="button" onClick={() => onOpenChange(false)} className="flex h-14 items-center justify-center rounded-full bg-secondary text-[18px] font-bold text-slate-brand">
            Volver
          </button>
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
          <EnlaceAMiCuenta
            href="/app/perfil/contacto-emergencia"
            className="flex h-14 items-center justify-center rounded-full bg-primary text-[16px] font-extrabold text-primary-foreground"
          >
            Cargar contacto de emergencia
          </EnlaceAMiCuenta>
        </div>
      </SheetContent>
    </Sheet>
  );
}
