"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { VitaIcon } from "@/lib/vita-icons";
import { useRefrescoPeriodico } from "@/components/vita/refresco-periodico";
import type { EstadoAvatar } from "@/components/vita/estados-avatar";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { desbloquearVoz, cancelarVoz, obtenerAudioBlob, reproducirBlob } from "@/lib/voz/hablar-cliente";
import { useSilencioVita } from "@/lib/voz/usar-silencio";
import { useGrabacionVoz } from "@/lib/voz/usar-grabacion-voz";
import { olvidarModoSimple, recordarModoSimple } from "@/lib/modo-simple/recordar";
import { volverAMiPerfilAction } from "@/app/app/familia/actions";
import { VELOCIDAD_VOZ_LENTA, type PrefsModoSimple } from "@/lib/modo-simple/tipos";
import { BarraSinConexion } from "@/components/vita/barra-sin-conexion";
import { posponerDosisAction, posponerMedicionAction } from "@/lib/notificaciones/actions";
import { usePushActivo } from "@/lib/notificaciones/usar-push-activo";
import type { MomentoDia } from "@/lib/medicamentos/tipos";
import {
  BarraInferior,
  Cabecera,
  EnlaceTodoElDia,
  FilaTurno,
  FranjaOlvidadas,
  TarjetaDescanso,
  TarjetaGrupo,
  TarjetaTurno,
  fraseAnuncio,
  listaHablada,
  type Dosis,
  type MedicionSimple,
  type Olvidada,
  type TurnoSimple,
} from "@/components/vita/modo-simple/piezas";
import { marcarGrupoNoTomadoAction, marcarGrupoTomadoAction } from "../rutina/actions";
import { interpretarVozPendiente } from "@/lib/modo-simple/confirmacion-voz";
import { ActivarNotificaciones } from "@/components/vita/activar-notificaciones";
import { AvisoRecordatorio } from "@/components/vita/aviso-recordatorio";
import type { MedHoy, TurnoProximo } from "@/lib/modo-simple/respuestas";
import { CharlaSimple } from "./charla-simple";
import { FlujoAyuda, type AyudaPedida } from "./flujo-ayuda";
import { TecladoMedicion } from "./teclado-medicion";
import type { MedirHoy, TipoMedirSimple } from "@/lib/modo-simple/medir";
import { textoAyudaSaben } from "@/lib/modo-simple/charla";
import { RUTA_RUTINA_SIMPLE } from "./lista-hoy";
import { RUTA_TURNO_SIMPLE } from "./turno/ruta";

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
  vencida,
  fechaDosis = null,
  olvidadas = [],
  proximaHora = null,
  recordatorios,
  config,
  turno,
  mediciones,
  medirAhora = null,
  turnoProximo,
  medsHoy,
  telefonoAyuda,
  nombreAyuda,
  tieneFamilia = true,
}: {
  /** Cuenta logueada: el modo simple queda recordado solo para ella. */
  usuarioId: string;
  nombre: string;
  saludo: string;
  fechaTexto: string;
  /** A quién llama Ayuda (Configurar modo simple o contacto de emergencia), o null si no hay. */
  telefonoAyuda: string | null;
  nombreAyuda: string | null;
  /** Alguien la cuida en vita: Ayuda avisa a la familia. Si no, Ayuda llama directo al contacto. */
  tieneFamilia?: boolean;
  /** Qué ve la persona (Configurar modo simple; defaults si no hay fila). */
  config: PrefsModoSimple;
  /** Turno de hoy o de mañana (null = ninguno, o la sección está apagada). */
  turno: TurnoSimple | null;
  /** Presión/azúcar con datos reales (null = nada que mostrar, o la sección está apagada). */
  mediciones: { titulo: string; items: MedicionSimple[] } | null;
  /** La medición del plan que toca ahora ("Es hora de medirte la presión"), o null. */
  medirAhora?: MedirHoy | null;
  /** Próximo turno (cualquier día) para la respuesta hablada de la charla; null = ninguno o sección apagada. */
  turnoProximo: TurnoProximo | null;
  /** Medicación de hoy con su estado, para las respuestas locales de la charla. */
  medsHoy: MedHoy[];
  /** Dosis pendientes del momento actual — la tarjeta principal. */
  grupo: Dosis[];
  momento: MomentoDia | null;
  vencida: boolean;
  /** Fecha de AYER cuando el grupo son dosis de ayer en la ventana de medianoche; si no, null. */
  fechaDosis?: string | null;
  /** Dosis de hoy de una hora anterior que quedaron sin marcar ("Te olvidaste…"). */
  olvidadas?: Olvidada[];
  /** "HH:MM" de lo próximo (pastilla o medición) para el descanso; null = nada más hoy. */
  proximaHora?: string | null;
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
  // "No la tomé" (dicho al botón de vita) siempre pregunta antes.
  const [preguntarNo, setPreguntarNo] = useState(false);
  // Lo que dijo con el botón de vita y no era ni "ya la tomé" ni "más tarde" ni "no": lo responde la charla.
  const [preguntaCharla, setPreguntaCharla] = useState<string | undefined>(undefined);
  const hayGrupo = grupo.length > 0;
  const fase: Fase = confirmadoLocal ? "confirmado" : !hayGrupo ? "descanso" : vencida ? "alertado" : "esperando";
  const { silenciada, alternar: alternarSilencio } = useSilencioVita({ porDefecto: false });
  const [charlaAbierta, setCharlaAbierta] = useState(false);
  const pushActivo = usePushActivo();
  const [ajustesAbiertos, setAjustesAbiertos] = useState(false);
  const [ayudaAbierta, setAyudaAbierta] = useState(false);
  // Botón "Ayuda": pregunta, cuenta regresiva, avisa a la familia y ofrece llamar.
  const [flujoAyuda, setFlujoAyuda] = useState(false);
  const [ayudaPedida, setAyudaPedida] = useState<AyudaPedida | null>(null);
  // Teclado grande de medición (dentro del modo simple, nunca el formulario normal).
  const [teclado, setTeclado] = useState<{ tipo: TipoMedirSimple; ultimo: string | null } | null>(null);
  const ultimaDe = (tipo: string) => mediciones?.items.find((m) => m.tipo === tipo)?.valor ?? null;
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

  // "Escuchar" de la tarjeta: desbloquear tiene que ser lo primero, dentro
  // del gesto sincrónico del tap (Safari/iOS no deja sonar sin un toque,
  // mismo criterio que vita-chat-overlay.tsx). No hay pantalla previa de
  // "Tocá para escuchar": la tarjeta se ve directo y vita lee al tocar.
  function alEscuchar() {
    desbloquearVoz();
    void reproducirAnuncio();
  }

  function confirmar() {
    if (!hayGrupo || pendiente || confirmadoLocal) return;
    // "¡Listo!" al instante (optimista): el servidor guarda por detrás y, si
    // falla, se vuelve atrás con el aviso.
    setConfirmadoLocal(true);
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

  // "Posponer": la tarjeta queda en pantalla (decisión 2026-11-15) y el servidor
  // programa el aviso al celular para dentro de N minutos (los del cuidador).
  function avisarPospuesto(r: { status: "success" | "error" }) {
    const n = config.posponer_min;
    if (r.status === "error") toast.error("No pude programar el aviso. Probá de nuevo.");
    else if (pushActivo) toast.success(`Listo. Te aviso de nuevo en ${n} minutos.`);
    else toast.info("Listo. Para que te avise al celular, activá los avisos.");
  }

  function posponerAqui() {
    void posponerDosisAction(grupo.map((m) => m.id), config.posponer_min)
      .then(avisarPospuesto)
      .catch(() => avisarPospuesto({ status: "error" }));
  }

  // "No la tomé": se pregunta antes (no se deshace desde acá) y deja de pedirla
  // hoy. El cuidador se entera en el resumen de la noche, no en el momento.
  function noTome() {
    setPreguntarNo(false);
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

  // "Sí, la tomé" de la franja de olvidadas: botones propios, nunca junto con la tarjeta.
  function tomeOlvidadas() {
    startTransition(async () => {
      try {
        const r = await marcarGrupoTomadoAction(olvidadas.map((o) => o.id), true);
        if (r.status === "error") toast.error("No se pudo registrar. Probá de nuevo.");
        else toast.success(olvidadas.length === 1 ? "Listo, la anoté." : "Listo, las anoté.");
      } catch {
        toast.error("No se pudo registrar. Probá de nuevo.");
      } finally {
        router.refresh();
      }
    });
  }

  function posponerMedicion() {
    if (!medirAhora) return;
    void posponerMedicionAction(medirAhora.monitoreoId, medirAhora.hora, config.posponer_min)
      .then(avisarPospuesto)
      .catch(() => avisarPospuesto({ status: "error" }));
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
    const t = setTimeout(() => router.refresh(), 3000);
    return () => clearTimeout(t);
  }, [guardado, router]);

  const { estado: estadoVoz, iniciar: iniciarVoz, detener: detenerVoz } = useGrabacionVoz({
    // El botón de vita de abajo con una pastilla pendiente: "ya la tomé" registra (como antes),
    // "más tarde" pospone, "no la tomé" pregunta antes y cualquier otra cosa la responde la charla.
    onTranscripcion: (texto) => {
      detenerVoz();
      const intencion = interpretarVozPendiente(texto);
      if (intencion === "tome") confirmar();
      else if (intencion === "posponer" && config.posponer) posponerAqui();
      else if (intencion === "no_tome") setPreguntarNo(true);
      else if (texto.trim()) abrirCharla(texto.trim());
      else toast.info("No te escuché. Tocá de nuevo y decime «ya la tomé».");
    },
    onError: (mensaje) => {
      toast.error(mensaje);
      detenerVoz();
    },
  });

  // La charla de voz tiene el micrófono para ella: se corta cualquier escucha de confirmación y el anuncio.
  function abrirCharla(pregunta?: string) {
    desbloquearVoz();
    cancelarVoz();
    detenerVoz();
    setReproduciendoAudio(false);
    setPreguntaCharla(pregunta);
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
    desbloquearVoz();
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

  const mostrarTarjeta = fase === "esperando" || fase === "alertado";
  const hayRemedio = mostrarTarjeta || fase === "confirmado";
  const mostrarMedir = !!medirAhora;
  // Lo de ahora: remedio y/o medición. Sin nada de eso, el turno grande ocupa el lugar del descanso.
  const nadaPendiente = !hayRemedio && !mostrarMedir;
  const franja = olvidadas.length > 0 && (
    <FranjaOlvidadas olvidadas={olvidadas} ocupado={pendiente} onTome={tomeOlvidadas} />
  );
  // Con una pastilla pendiente, el botón de vita escucha "ya la tomé" (el mismo de antes, movido).
  const escuchaPastilla = mostrarTarjeta && !silenciada && config.charlar;
  const n = grupo.length;
  // Medición sola: el botón de vita le pide el número (abre la charla, que ofrece "¿Lo anoto así?").
  const pideMedicion = !hayRemedio && mostrarMedir && config.charlar;
  const sugerencia = !escuchaPastilla
    ? pideMedicion
      ? "Decime el número"
      : null
    : estadoVoz === "inactivo"
      ? n === 1
        ? "Decime «ya la tomé»"
        : "Decime «ya las tomé»"
      : estadoVoz === "procesando"
        ? "Un momento…"
        : "Te escucho…";

  return (
    <div className="fixed inset-0 z-30 bg-cream">
      {/* Mismo ancho que el resto de la app (max-w-md), centrado: en una pantalla ancha no se estira. */}
      <div className="relative mx-auto flex h-full w-full max-w-md flex-col">
      <div className="flex-1 overflow-y-auto px-5 pb-[168px] pt-[max(1.25rem,env(safe-area-inset-top))]">
        <BarraSinConexion grande />
        <Cabecera
          saludo={saludo}
          nombre={nombre}
          fechaTexto={fechaTexto}
          // Con familia en vita: el flujo (avisar y ofrecer llamar). Sin nadie vinculado: llama
          // directo al contacto de emergencia (`tel:`), o explica dónde cargarlo si no hay.
          onAyuda={() => (tieneFamilia ? setFlujoAyuda(true) : setAyudaAbierta(true))}
          telefono={tieneFamilia ? null : telefonoAyuda}
          contacto={nombreAyuda}
          conAyuda={config.ayuda}
        />
        {ayudaPedida && (
          <div role="status" className="mt-4 flex items-center gap-3 rounded-[20px] bg-success/12 px-4 py-3.5 text-[17px] font-bold leading-[1.35] text-foreground">
            <VitaIcon name="check" size={22} strokeWidth={2.6} className="shrink-0 text-success" />
            {textoAyudaSaben(ayudaPedida.nombres, ayudaPedida.hora) || `Tu familia sabe que pediste ayuda a las ${ayudaPedida.hora}.`}
          </div>
        )}

        <div className="mt-5 flex flex-col gap-4">
          <ActivarNotificaciones variante="simple" />
          {recordatorios.length > 0 && <AvisoRecordatorio grande items={recordatorios} />}

          {turno && !nadaPendiente && <FilaTurno turno={turno} href={RUTA_TURNO_SIMPLE} />}

          {/* "Ya tomé" transforma la misma tarjeta (no una pantalla aparte): queda
              "¡Muy bien!" con "Me equivoqué" hasta que la página se recarga. */}
          {fase === "confirmado" && <TarjetaConfirmada grupo={grupo} onDeshacer={deshacer} />}

          {mostrarTarjeta && (
            <TarjetaGrupo
              grupo={grupo}
              momento={momento}
              alertado={fase === "alertado"}
              deAyer={!!fechaDosis}
              confirmando={pendiente}
              silenciada={silenciada}
              conVoz={config.voz}
              puedePosponer={config.posponer}
              minutosPosponer={config.posponer_min}
              onConfirmar={confirmar}
              onEscuchar={alEscuchar}
              onPosponer={posponerAqui}
            >
              {franja}
            </TarjetaGrupo>
          )}

          {mostrarMedir && medirAhora && (
            <TarjetaMedirAhora
              medir={medirAhora}
              compacta={hayRemedio}
              puedePosponer={config.posponer}
              minutosPosponer={config.posponer_min}
              conVita={config.charlar}
              onAnotar={() => setTeclado({ tipo: medirAhora.tipo, ultimo: ultimaDe(medirAhora.tipo) })}
              onPosponer={posponerMedicion}
            >
              {!hayRemedio && franja}
            </TarjetaMedirAhora>
          )}

          {nadaPendiente && turno && <TarjetaTurno turno={turno} />}
          {nadaPendiente && turno && franja && <div className="rounded-[28px] bg-card px-5 pb-5 shadow-card">{franja}</div>}
          {nadaPendiente && !turno && <TarjetaDescanso proximaHora={proximaHora ?? undefined}>{franja}</TarjetaDescanso>}

          <EnlaceTodoElDia href={RUTA_RUTINA_SIMPLE} />
        </div>
      </div>
      <BarraInferior
        estado={estadoAvatar}
        onHablar={escuchaPastilla ? alternarEscuchaVoz : () => abrirCharla()}
        onAjustes={() => setAjustesAbiertos(true)}
        conCharla={config.charlar}
        sugerencia={sugerencia}
      />
      </div>

      <SheetAjustes
        open={ajustesAbiertos}
        onOpenChange={setAjustesAbiertos}
        silenciada={silenciada}
        onAlternarSonido={alternarSonido}
      />
      <SheetAyudaSinContacto open={ayudaAbierta && !telefonoAyuda} onOpenChange={setAyudaAbierta} />
      {teclado && <TecladoMedicion tipo={teclado.tipo} ultimo={teclado.ultimo} onCerrar={() => setTeclado(null)} />}
      {flujoAyuda && (
        <FlujoAyuda telefono={telefonoAyuda} contacto={nombreAyuda} onCerrar={() => setFlujoAyuda(false)} onAvisados={setAyudaPedida} />
      )}
      <SheetNoTome open={preguntarNo} onOpenChange={setPreguntarNo} cuantas={grupo.length} onSi={noTome} />
      {charlaAbierta && (
        <CharlaSimple
          nombre={nombre}
          config={config}
          medsHoy={medsHoy}
          turnoProximo={turnoProximo}
          preguntaInicial={preguntaCharla}
          onCerrar={() => setCharlaAbierta(false)}
          telefonoAyuda={telefonoAyuda}
          nombreAyuda={nombreAyuda}
          onAyudaSinContacto={() => setAyudaAbierta(true)}
        />
      )}
    </div>
  );
}

function TarjetaConfirmada({ grupo, onDeshacer }: { grupo: Dosis[]; onDeshacer: () => void }) {
  return (
    <div role="status" className="flex flex-col items-center gap-3 rounded-[28px] bg-teal-deep p-6 text-center text-primary-foreground shadow-card">
      <div className="flex size-16 items-center justify-center rounded-full bg-primary-foreground/20">
        <VitaIcon name="check" size={34} color="var(--primary-foreground)" />
      </div>
      <div className="font-heading text-[30px] font-extrabold tracking-[-0.03em]">¡Muy bien!</div>
      <div className="text-[18px] opacity-90">
        {grupo.length === 1
          ? `Registramos que tomaste ${grupo[0].nombre}`
          : `Registramos tus ${grupo.length} pastillas: ${listaHablada(grupo.map((m) => m.nombre))}`}
      </div>
      <button
        type="button"
        onClick={onDeshacer}
        className="mt-3 min-h-14 rounded-full border-2 border-primary-foreground/60 px-6 text-[18px] font-bold text-primary-foreground transition-transform active:scale-[0.98] motion-reduce:transition-none"
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

// "Es hora de medirte la presión": recordatorio del plan de monitoreo. Junto a
// una pastilla va compacta (debajo); sola ocupa el lugar principal.
function TarjetaMedirAhora({
  medir,
  compacta,
  puedePosponer,
  minutosPosponer,
  conVita,
  onAnotar,
  onPosponer,
  children,
}: {
  medir: MedirHoy;
  compacta: boolean;
  puedePosponer: boolean;
  minutosPosponer: number;
  /** "Hablar con Vita" habilitado en Configurar modo simple. */
  conVita: boolean;
  onAnotar: () => void;
  onPosponer: () => void;
  children?: React.ReactNode;
}) {
  const icono = (
    <span aria-hidden className="flex size-14 shrink-0 items-center justify-center rounded-[18px] bg-destructive/10 text-destructive">
      <VitaIcon name={ICONO_MEDIR[medir.tipo]} size={28} />
    </span>
  );
  if (compacta) {
    return (
      <section className="flex items-center gap-3.5 rounded-[24px] bg-card p-4 shadow-card">
        {icono}
        <h2 className="min-w-0 flex-1 font-heading text-[20px] font-extrabold leading-tight tracking-[-0.02em] text-balance">Es hora de medirte {medir.frase}</h2>
        <button
          type="button"
          onClick={onAnotar}
          className="flex min-h-14 shrink-0 items-center justify-center rounded-full bg-primary px-4 text-[17px] font-extrabold text-primary-foreground active:scale-[0.98] motion-reduce:transform-none"
        >
          Anotar ahora
        </button>
      </section>
    );
  }
  const secundario =
    "flex h-[58px] items-center justify-center gap-2.5 rounded-full border-2 border-foreground/10 bg-card text-[19px] font-extrabold active:scale-[0.98] motion-reduce:transform-none";
  return (
    <section className="flex flex-col gap-3 rounded-[28px] bg-card p-5 shadow-card ring-2 ring-primary/30">
      <div className="flex items-center gap-3.5">
        {icono}
        <div className="min-w-0">
          <h2 className="font-heading text-[25px] font-extrabold leading-tight tracking-[-0.02em] text-balance">Es hora de medirte {medir.frase}</h2>
          <p className="mt-0.5 text-[17px] font-semibold text-subtle">
            {conVita ? "Cuando tengas el número, contáselo a vita." : `A las ${horaCortaMedir(medir.hora)}`}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onAnotar}
        className="mt-1 flex h-[64px] items-center justify-center gap-2 rounded-full bg-primary text-[21px] font-extrabold text-primary-foreground shadow-cta active:scale-[0.98] motion-reduce:transform-none"
      >
        Escribir el número
      </button>
      {puedePosponer && (
        <button type="button" onClick={onPosponer} className={secundario}>
          <VitaIcon name="clock" size={24} strokeWidth={2.4} />
          Posponer {minutosPosponer} minutos
        </button>
      )}
      {children}
    </section>
  );
}

const ICONO_MEDIR: Record<TipoMedirSimple, string> = {
  presion: "heart",
  glucemia: "droplet",
  peso: "scale",
  temperatura: "thermometer",
};

/** "09:00" -> "9:00". */
function horaCortaMedir(hhmm: string): string {
  return hhmm.replace(/^0(\d:)/, "$1");
}
