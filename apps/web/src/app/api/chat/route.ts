import "server-only";

import { after, NextResponse } from "next/server";
import { limpiarDato } from "@/lib/ai/limpiar";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { MODELO_IA, MAX_TOKENS_CHAT } from "@/lib/ai/modelo";
import { TOOLS } from "@/lib/ai/tools";
import { TOOLS_DE_ESCRITURA } from "@/lib/ai/destino";
import {
  alcanzaParaOtraVuelta,
  MARGEN_CIERRE_MS,
  msHastaElCorte,
  REINTENTOS_SDK,
  restanteMs,
  textoCortePorTiempo,
  timeoutSdkMs,
  usoParcial,
} from "@/lib/ai/presupuesto";
import { clasificarErrorProveedor, mensajeErrorProveedor } from "@/lib/ai/errores-proveedor";
import { verificarLimitePedidos } from "@/lib/limites/nucleo";
import { LIMITES_CHAT } from "@/lib/limites/logica";
import { calcularVersionPrompt, clasificarError, construirFilaRegistro, medicionInicial } from "@/lib/chat/registros-logica";
import { registrarRespuestaChat } from "@/lib/chat/registros";
import { contextoDinamicoParaModo, leerModoChat, resultadoToolBloqueada, toolsParaModo } from "@/lib/ai/modo-simple";
import { SYSTEM_PROMPT, armarSystemChat, bloqueHoy, construirContextoPersonas, contextoDinamicoChat } from "@/lib/ai/prompt-chat";
import {
  ejecutarToolIdempotente,
  normalizarPedidoId,
  estadoDelReintento,
  accionesDelPedido,
  purgarPendientes,
  confirmarSinModelo,
  UUID_RE,
  clasificarRespuesta,
} from "@/lib/chat/pedidos";
import { detectarEmergencia, textoEmergencia } from "@/lib/ai/emergencia";
import * as chat from "@/lib/chat/nucleo";
import { cargarMemoriasParaContexto, estadoMemoria, listarContradicciones, marcarContradiccionesPreguntadas } from "@/lib/memoria/nucleo";
import { contextoContradicciones, contextoMemoria, debeMostrarContradicciones, MAX_CONTRADICCIONES_CONTEXTO, visibilidadContradiccion } from "@/lib/memoria/contexto";
import { cargarContextoResumen, pedirResumen } from "@/lib/memoria/resumen";
import { debePedirResumen } from "@/lib/memoria/resumen-logica";
import { obtenerUsoHoy, registrarUsoIA, verificarLimiteDiario } from "@/lib/uso-ia/nucleo";
import { listarFamilia } from "@/lib/familia/nucleo";
import type { MiembroFamilia } from "@/lib/familia/tipos";
import { descripcionAhoraEnAR, fechaDeHoyISO } from "@/lib/rutina/formato";
import { listarHoy } from "@/lib/medicamentos/nucleo";
import { textoDosis } from "@/lib/medicamentos/tipos";
import { listarDeHoy } from "@/lib/turnos/nucleo";

export const runtime = "nodejs";
// Segundos; tiene que ser un literal (Next lo lee estático). Alineado con PRESUPUESTO_RESPUESTA_MS
// (lib/ai/presupuesto.ts), que explica cómo subirlo junto con el timeout de funciones de Netlify.
export const maxDuration = 10;

// Modelo y tope de tokens en lib/ai/modelo.ts (sonnet: punto justo de
// latencia/calidad para una conversación con tool-calling).
const MAX_TURNOS_TOOL_USE = 6;
// Solo los últimos N mensajes de la sesión viajan al modelo (el historial
// completo sigue en la DB): acota el costo de cada turno del loop.
const MAX_MENSAJES_HISTORIAL = 30;
// Tope de largo del mensaje del usuario (se valida ANTES de llamar a Anthropic).
const MAX_CARACTERES_MENSAJE = 4000;
// Tope de ítems del bloque "Hoy" del contexto.
const MAX_ITEMS_HOY = 20;
// Tools que no consultan ni cambian datos: solo disparan un efecto de UI. Si el
// turno ya trajo texto y usó solo estas, no hace falta otra llamada al modelo. (`proponer_medicion` NO
// está: su resultado puede ser un error de validación que el modelo tiene que ver para pedir el valor de nuevo.
// `pedir_ayuda_familia` tampoco: el modelo tiene que leer su resultado (avisado / repetido / no se mandó) para
// no decir nunca "le avisé a tu familia" si no ocurrió.)
const TOOLS_SIN_DATOS = new Set(["set_avatar_mood", "show_today_medications", "show_all_medications", "open_screen"]);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: REINTENTOS_SDK });

// Versión del prompt para registros_chat: hash de la plantilla ESTÁTICA (SYSTEM_PROMPT, que se arma una
// sola vez al cargar el módulo; la guía de pantallas es constante) + TOOLS + modelo. El contexto por
// request (Personas, Hoy, fecha) se agrega DESPUÉS en el segundo bloque de `armarSystemChat` y no entra al hash.
// (No se exporta: un route.ts solo puede exportar handlers.)
const VERSION_PROMPT = calcularVersionPrompt(SYSTEM_PROMPT, TOOLS, MODELO_IA);
// El modo simple ofrece otras tools (y su estilo va en el bloque dinámico): se distingue en los registros.
const TOOLS_SIMPLE = toolsParaModo("simple");
const VERSION_PROMPT_SIMPLE = `${calcularVersionPrompt(SYSTEM_PROMPT, TOOLS_SIMPLE, MODELO_IA)}:simple`;

// Bloque "Hoy" del contexto: medicamentos (con estado) y turnos de hoy de quien
// chatea, para no gastar una llamada a tool en "qué me toca hoy". Nombres y
// lugares los carga el usuario: se limpian como DATO. Si falla, se omite.
async function construirContextoHoy(supabase: Awaited<ReturnType<typeof createClient>>, usuarioId: string): Promise<string> {
  try {
    const [meds, turnos] = await Promise.all([listarHoy(supabase, usuarioId), listarDeHoy(supabase, usuarioId)]);
    const textoMeds = meds
      .slice()
      .sort((a, b) => a.hora_programada.localeCompare(b.hora_programada))
      .slice(0, MAX_ITEMS_HOY)
      .map((m) => {
        const dosis = textoDosis(m);
        return `${limpiarDato(m.nombre)}${dosis ? ` ${limpiarDato(dosis, 20)}` : ""} ${m.hora_programada.slice(0, 5)} (${m.tomado ? "tomado" : "pendiente"})`;
      });
    const textoTurnos = turnos.slice(0, MAX_ITEMS_HOY).map((t) => {
      const lugar = t.lugar ? ` en ${limpiarDato(t.lugar)}` : "";
      return `${limpiarDato(t.especialidad)} ${t.hora.slice(0, 5)}${lugar}`;
    });
    return bloqueHoy(textoMeds, textoTurnos);
  } catch {
    return "";
  }
}

function eventoSSE(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

// Error "amable" que el overlay muestra sin ofrecer reintento (el mismo pedido
// volvería a fallar igual).
function respuestaErrorSinReintento(mensaje: string, status = 200): Response {
  return new Response(`${eventoSSE({ error: mensaje, sinReintento: true })}data: [DONE]\n\n`, {
    status,
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache" },
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response("No autenticado.", { status: 401 });
  }

  let cuerpo: {
    sesionId?: string;
    mensaje?: unknown;
    pedidoId?: string;
    reintento?: boolean;
    perfilActivoId?: string;
    confirmacionId?: unknown;
    modo?: unknown;
  };
  try {
    cuerpo = await request.json();
  } catch {
    return respuestaErrorSinReintento("No pude leer tu mensaje. Probá de nuevo.");
  }
  const { sesionId: sesionIdEntrante, pedidoId: pedidoIdEntrante, reintento, perfilActivoId } = cuerpo;
  // Validación ANTES de llamar a Anthropic (y de gastar el límite diario).
  if (typeof cuerpo.mensaje !== "string" || cuerpo.mensaje.trim() === "") {
    return respuestaErrorSinReintento("Escribí un mensaje para vita.");
  }
  if (cuerpo.mensaje.length > MAX_CARACTERES_MENSAJE) {
    return respuestaErrorSinReintento(
      `Tu mensaje es muy largo (máximo ${MAX_CARACTERES_MENSAJE} caracteres). Probá dividirlo en partes más cortas.`
    );
  }
  const mensaje = cuerpo.mensaje;
  // Chat de modo simple (pantalla de voz de la persona): estilo corto + tools acotadas. Opera SOLO sobre la
  // cuenta logueada: sin familia ni perfil abierto, así ninguna tool puede apuntar a otra persona.
  const modo = leerModoChat(cuerpo.modo);
  const modoSimple = modo === "simple";
  const toolsDelModo = modoSimple ? TOOLS_SIMPLE : TOOLS;
  // Id de la acción pendiente cuyo botón tocó el usuario: solo un uuid; el servidor lo valida contra su fila.
  const confirmacionId =
    typeof cuerpo.confirmacionId === "string" && UUID_RE.test(cuerpo.confirmacionId) ? cuerpo.confirmacionId : undefined;
  // Un cliente viejo sin pedidoId igual funciona: se genera uno del lado servidor.
  const pedidoId = normalizarPedidoId(pedidoIdEntrante);
  // Red de seguridad estática: si el modelo no puede responder, igual sale este texto.
  const emergencia = detectarEmergencia(mensaje);

  // Registro best-effort de la respuesta (registros_chat): la fila se arma al terminar el stream y se
  // inserta con `after`, o sea cuando la respuesta ya se envió; nunca demora lo que ve el usuario.
  const inicioMs = performance.now();
  const medicion = medicionInicial();
  let cerrarRegistro: () => void = () => {};
  // Memoria (fase 3): si la respuesta quedó guardada, se marca el resumen de ESTA persona como pendiente cuando se
  // juntaron suficientes mensajes. Va en el mismo `after` (con la respuesta ya enviada); nunca en modo simple.
  let respuestaGuardada = false;
  // Contradicciones que se le pusieron delante a vita por primera vez en este turno (migración 043).
  let contradiccionesAMarcar: string[] = [];
  after(
    new Promise<void>((resolver) => {
      cerrarRegistro = resolver;
    }).then(() =>
      registrarRespuestaChat(
        construirFilaRegistro({
          usuarioId: user.id,
          pedidoId,
          versionPrompt: modoSimple ? VERSION_PROMPT_SIMPLE : VERSION_PROMPT,
          modelo: MODELO_IA,
          inicioMs,
          finMs: performance.now(),
          medicion,
          toolsDeEscritura: TOOLS_DE_ESCRITURA,
        })
      )
    ).then(async () => {
      if (debePedirResumen({ modoSimple, respuestaGuardada })) await pedirResumen(supabase);
    })
  );

  // Límite de pedidos por usuario/IP (migración 035; falla abierto). Va antes de gastar nada: 429 con el
  // mensaje que el overlay muestra. Se registra como 'limite'/'pedidos' (distinto del límite de tokens).
  const pedidos = await verificarLimitePedidos({ usuarioId: user.id, headers: request.headers, limites: LIMITES_CHAT });
  if (!pedidos.ok) {
    medicion.resultado = "limite";
    medicion.errorCodigo = "pedidos";
    cerrarRegistro();
    // Emergencia: ni el límite de pedidos puede dejar al usuario sin los teléfonos.
    if (emergencia) {
      return new Response(
        `${eventoSSE({ chunk: textoEmergencia(emergencia) })}${eventoSSE({ error: pedidos.mensaje, sinReintento: true })}data: [DONE]\n\n`,
        { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache" } }
      );
    }
    return NextResponse.json(
      { error: pedidos.mensaje },
      { status: 429, headers: { "Retry-After": String(pedidos.reintentarEnSegundos) } }
    );
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const enviar = (data: unknown) => controller.enqueue(encoder.encode(eventoSSE(data)));
      // "[DONE]" es un sentinel literal, no JSON — mismo contrato que el
      // agente original (`agent/README.md`: "data: [DONE]", sin comillas).
      const enviarUso = (u: { usados: number; limite: number; restantes: number; porcentajeUsado: number }) =>
        enviar({ uso: { usados: u.usados, limite: u.limite, restantes: u.restantes, porcentajeUsado: u.porcentajeUsado } });
      const enviarFin = () => controller.enqueue(encoder.encode("data: [DONE]\n\n"));

      let textoAcumulado = ""; // se persiste como UN mensaje del asistente al final,
      // igual a como el cliente lo muestra en una sola burbuja.
      let tokensInputAcumulados = 0;
      let tokensCacheLecturaAcumulados = 0;
      let tokensCacheEscrituraAcumulados = 0;
      let tokensOutputAcumulados = 0; // sumado por turno (lib/uso-ia/nucleo.ts) —
      // el chat es el punto que más consume de los tres (loop de hasta
      // MAX_TURNOS_TOOL_USE llamadas reales a Anthropic por mensaje del
      // usuario), así que el límite diario se chequea acá antes de nada.

      // Corte duro del presupuesto: si una llamada al modelo se cuelga, este controlador la aborta.
      const controlador = new AbortController();
      const temporizadorCorte = setTimeout(() => controlador.abort(), msHastaElCorte(inicioMs, performance.now()));
      let cortePorTiempo = false;
      let fallaPorTiempo = false;
      let escriturasHechas = 0; // tarjetas de escritura ya emitidas: lo hecho no se pierde si se corta

      try {
        const limite = await verificarLimiteDiario(user.id);
        if (!limite.ok) {
          medicion.resultado = "limite";
          const uso = await obtenerUsoHoy(user.id);
          if (uso) enviarUso(uso);
          // Emergencia: el límite no puede dejar al usuario sin los teléfonos.
          if (emergencia) enviar({ chunk: textoEmergencia(emergencia) });
          enviar({ error: limite.mensaje, sinReintento: true });
          enviarFin();
          return;
        }

        // Un sesionId entrante solo se usa si de verdad es del usuario —
        // ver el comentario en sesionPerteneceAUsuario(). Si no matchea
        // (URL manipulada a mano, o la sesión ya no existe), se trata
        // igual que "sin sesionId": se crea una nueva y se le avisa al
        // cliente cuál es la real.
        const sesionValida =
          !!sesionIdEntrante && (await chat.sesionPerteneceAUsuario(supabase, user.id, sesionIdEntrante));
        const sesionId = sesionValida
          ? sesionIdEntrante!
          : await chat.crearSesion(supabase, user.id);
        medicion.sesionId = sesionId;
        if (!sesionValida) enviar({ session: sesionId });

        // En un reintento el primer intento pudo haber llegado más o menos lejos.
        const previo =
          reintento === true && sesionValida
            ? await estadoDelReintento(supabase, user.id, sesionId, mensaje)
            : { estado: "nuevo" as const };
        if (previo.estado === "respondido") {
          // Ya terminó del lado servidor: se devuelve la respuesta guardada
          // sin volver a correr el modelo (ni gastar tokens ni escribir dos veces).
          medicion.resultado = "replay";
          for (const accion of await accionesDelPedido(supabase, user.id, pedidoId)) enviar({ action: accion });
          enviar({ chunk: previo.respuesta });
          enviarFin();
          return;
        }
        // Si el estado es "desconocido" (la DB falló dos veces) NO se reinserta: el cliente marcó
        // reintento, así que el primer intento probablemente ya lo guardó (mejor no duplicar que perder
        // el contexto); si no estaba, se suma al historial en memoria más abajo.
        // El id del mensaje guardado es el origen de los recuerdos que vita saque de él (para poder olvidarlos).
        let mensajeOrigenId: string | null = null;
        if (previo.estado === "nuevo") mensajeOrigenId = await chat.guardarMensaje(supabase, user.id, sesionId, "user", mensaje);

        // El modelo no sabe qué día es: sin esto resolvía "mañana" con su
        // propio año de referencia y agendaba turnos un año en el pasado
        // (que después no aparecían en la Rutina).
        // Familia: el modelo puede actuar sobre las personas que el usuario
        // cuida (vínculos reales de listar_familia, con la sesión: nunca se
        // confía en un id del cliente ni del modelo). El cliente manda el id
        // del perfil abierto en pantalla (la cookie no llega a esta ruta,
        // path /app); solo cuenta si es el propio usuario o un miembro.
        let familia: MiembroFamilia[] = [];
        try {
          familia = modoSimple ? [] : await listarFamilia(supabase);
        } catch {
          // Sin la lista el chat sigue, solo con la cuenta propia.
        }
        const abierto =
          !modoSimple && typeof perfilActivoId === "string" && perfilActivoId !== user.id
            ? familia.find((f) => f.id === perfilActivoId)
            : undefined;
        // Botón "Confirmar" de una borrada/cambio de horario: lo resuelve el servidor SIN modelo,
        // con la acción guardada en la pendiente (mismo mecanismo de pendientes por sesión).
        if (confirmacionId) {
          const directa = await confirmarSinModelo({
            supabase,
            usuarioId: user.id,
            pedidoId,
            sesionId,
            confirmacionId,
            familia,
            abiertoId: abierto?.id,
          });
          if (directa) {
            // Una confirmación que no se ejecutó (sin verificar, vencida, cambió...) cuenta como error.
            medicion.resultado = directa.codigo ? "error" : "confirmacion";
            medicion.errorCodigo = directa.codigo ?? null;
            if (directa.accionUI) enviar({ action: directa.accionUI });
            enviar({ chunk: directa.texto });
            await chat.guardarMensaje(supabase, user.id, sesionId, "assistant", directa.texto);
            enviarFin();
            return;
          }
        }

        // El historial se reconstruye SIEMPRE desde la DB (fuente de
        // verdad), nunca se confía en lo que mande el cliente.
        const mensajesGuardados = await chat.listarMensajes(supabase, user.id, sesionId);
        // Solo los últimos N, y la lista tiene que arrancar con un turno del
        // usuario (la API lo exige): se recorta del principio hasta lograrlo.
        const recientes = mensajesGuardados.slice(-MAX_MENSAJES_HISTORIAL);
        const primerUsuario = recientes.findIndex((m) => m.role === "user");
        const historial: Anthropic.MessageParam[] = (primerUsuario === -1 ? [] : recientes.slice(primerUsuario)).map(
          (m) => ({
            role: m.role,
            content: m.contenido,
          })
        );
        // Estado "desconocido": si el mensaje no quedó guardado, igual el modelo tiene que verlo.
        if (previo.estado === "desconocido") {
          const ultimoGuardado = mensajesGuardados[mensajesGuardados.length - 1];
          if (!(ultimoGuardado?.role === "user" && ultimoGuardado.contenido === mensaje)) {
            historial.push({ role: "user", content: mensaje });
          }
        }

        const contextoPerfil = construirContextoPersonas(user.id, familia, abierto);

        // El mensaje se clasifica UNA vez por request (sí/no/otro) y es lo que
        // usa pedidos.ts. Un "no" invalida TODAS las confirmaciones pendientes
        // ANTES de llamar al modelo: un "ok" posterior y no relacionado no puede
        // ejecutar una acción vieja.
        const respuestaUsuario = clasificarRespuesta(
          mensaje,
          familia.map((f) => f.nombre)
        );
        if (respuestaUsuario === "no") await purgarPendientes(supabase, user.id);

        const contextoHoy = await construirContextoHoy(supabase, user.id);

        // Prompt caching: el bloque estático (reglas + tools, que se renderizan antes) lleva el breakpoint; todo
        // lo volátil (Personas, Hoy, fecha) va en un segundo bloque SIN cache_control, después del breakpoint.
        // Memoria (fase 2): estado + recuerdos vigentes, con tope en tokens, en el bloque DINÁMICO. El modo simple no la usa.
        // Sin la migración 038 queda vacío y el chat funciona igual.
        let textoMemoria = "";
        if (!modoSimple) {
          const estadoMem = await estadoMemoria(supabase, user.id);
          const memorias = estadoMem.disponible && estadoMem.activa ? await cargarMemoriasParaContexto(supabase, user.id) : [];
          textoMemoria = contextoMemoria({
            disponible: estadoMem.disponible,
            activa: estadoMem.activa,
            memorias,
            familia: familia.map((f) => ({ id: f.id, nombre: f.nombre })),
          });
          // Resumen de charlas anteriores (fase 3): solo de la cuenta logueada y solo con la memoria activa. Va en el
          // bloque dinámico, saneado y con tope; sin la migración 041 queda vacío.
          if (estadoMem.disponible && estadoMem.activa) textoMemoria += await cargarContextoResumen(supabase, user.id);
          // Contradicciones por confirmar (fase 4, migración 043; máx. 2): solo en el chat normal y con la memoria activa. Una
          // vez preguntadas siguen visibles 30 min (para poder resolverlas cuando contesta) y después se ocultan. Se marcan
          // como preguntadas SOLO si la respuesta sale completa (más abajo): una falla del modelo no gasta el intento.
          if (debeMostrarContradicciones({ modoSimple, disponible: estadoMem.disponible, activa: estadoMem.activa })) {
            const ahoraContexto = new Date();
            const porConfirmar = (await listarContradicciones(supabase, user.id))
              .map((c) => ({ c, v: visibilidadContradiccion(c, ahoraContexto) }))
              .filter((x) => x.v.visible)
              .slice(0, MAX_CONTRADICCIONES_CONTEXTO);
            const bloque = contextoContradicciones(porConfirmar.map(({ c, v }) => ({ id: c.id, textoA: c.textoA, textoB: c.textoB, pregunta: c.pregunta, nuevaPregunta: v.nuevaPregunta })));
            if (bloque) {
              textoMemoria += bloque;
              contradiccionesAMarcar = porConfirmar.filter((x) => x.v.nuevaPregunta).map((x) => x.c.id);
            }
          }
        }
        const contextoDinamico = contextoDinamicoChat({
          contextoPerfil,
          contextoHoy,
          contextoMemoria: textoMemoria,
          ahora: descripcionAhoraEnAR(),
          hoyISO: fechaDeHoyISO(),
        });
        const system = armarSystemChat(contextoDinamicoParaModo(modo, contextoDinamico));

        for (let turno = 0; turno < MAX_TURNOS_TOOL_USE; turno++) {
          // Antes de otra vuelta del modelo: si el presupuesto ya no alcanza, se corta acá.
          if (turno > 0 && !alcanzaParaOtraVuelta(restanteMs(inicioMs, performance.now()))) {
            cortePorTiempo = true;
            break;
          }
          const respuesta = anthropic.messages.stream(
            {
              model: MODELO_IA,
              max_tokens: MAX_TOKENS_CHAT,
              system,
              tools: toolsDelModo,
              messages: historial,
            },
            { signal: controlador.signal, timeout: timeoutSdkMs(inicioMs, performance.now()) }
          );

          medicion.vueltas++;
          respuesta.on("text", (texto) => {
            medicion.primerTokenMs ??= performance.now() - inicioMs;
            textoAcumulado += texto;
            enviar({ chunk: texto });
          });

          let mensajeFinal: Anthropic.Message;
          try {
            mensajeFinal = await respuesta.finalMessage();
          } catch (e) {
            // La llamada no terminó (corte, error del proveedor): lo que el stream ya reportó igual
            // se consumió, así que se suma al uso en vez de perderlo.
            const parcial = usoParcial(respuesta.currentMessage);
            tokensInputAcumulados += parcial.input;
            tokensOutputAcumulados += parcial.output;
            tokensCacheLecturaAcumulados += parcial.cacheRead;
            tokensCacheEscrituraAcumulados += parcial.cacheWrite;
            medicion.tokensCacheLectura += parcial.cacheRead;
            medicion.tokensCacheEscritura += parcial.cacheWrite;
            medicion.tokensEntrada += parcial.input;
            medicion.tokensSalida += parcial.output;
            // El corte del presupuesto abortó la llamada: no es un error del proveedor.
            const pasadoElCorte =
              controlador.signal.aborted ||
              (e instanceof Anthropic.APIConnectionTimeoutError && restanteMs(inicioMs, performance.now()) <= MARGEN_CIERRE_MS);
            if (pasadoElCorte) {
              cortePorTiempo = true;
              break;
            }
            throw e;
          }
          historial.push({ role: "assistant", content: mensajeFinal.content });
          tokensInputAcumulados += mensajeFinal.usage.input_tokens;
          tokensOutputAcumulados += mensajeFinal.usage.output_tokens;
          tokensCacheLecturaAcumulados += mensajeFinal.usage.cache_read_input_tokens ?? 0;
          tokensCacheEscrituraAcumulados += mensajeFinal.usage.cache_creation_input_tokens ?? 0;
          medicion.tokensEntrada += mensajeFinal.usage.input_tokens;
          medicion.tokensSalida += mensajeFinal.usage.output_tokens;
          medicion.tokensCacheLectura += mensajeFinal.usage.cache_read_input_tokens ?? 0;
          medicion.tokensCacheEscritura += mensajeFinal.usage.cache_creation_input_tokens ?? 0;

          if (mensajeFinal.stop_reason !== "tool_use") break;

          const usosDeTool = mensajeFinal.content.filter(
            (bloque): bloque is Anthropic.ToolUseBlock => bloque.type === "tool_use"
          );

          for (const u of usosDeTool) medicion.tools.push(u.name); // solo nombres, nunca inputs

          const turnoConTexto = mensajeFinal.content.some((b) => b.type === "text" && b.text.trim() !== "");
          const soloSinDatos = usosDeTool.every((u) => TOOLS_SIN_DATOS.has(u.name));

          const resultadosTool: Anthropic.ToolResultBlockParam[] = [];
          for (const uso of usosDeTool) {
            // Una tool fuera de la lista activa se rechaza aunque el modelo la nombre.
            const bloqueada = resultadoToolBloqueada(modo, uso);
            if (bloqueada) {
              resultadosTool.push(bloqueada);
              continue;
            }
            const resultado = await ejecutarToolIdempotente(
              uso.name,
              uso.input as Record<string, unknown>,
              {
                supabase,
                usuarioId: user.id,
                pedidoId,
                sesionId,
                mensajeUsuario: mensaje,
                respuestaUsuario,
                confirmacionId,
                familia,
                abiertoId: abierto?.id,
                mensajeOrigenId,
              }
            );
            if (resultado.accionUI) enviar({ action: resultado.accionUI });
            if (resultado.accionUI && TOOLS_DE_ESCRITURA.has(uso.name)) escriturasHechas++;
            resultadosTool.push({
              type: "tool_result",
              tool_use_id: uso.id,
              content: resultado.contenido,
            });
          }

          // Ya respondió en texto y solo pidió efectos de UI: otra llamada al
          // modelo sería gasto sin contenido nuevo. Los tokens ya se sumaron.
          if (turnoConTexto && soloSinDatos) break;

          historial.push({ role: "user", content: resultadosTool });
        }

        if (cortePorTiempo) {
          // Sin texto ni escrituras es una falla para reintentar; si ya hay algo, se cierra con una nota
          // corta y lo hecho queda (las tarjetas ya salieron). Se registra 'error'/'tiempo' en ambos casos.
          medicion.resultado = "error";
          medicion.errorCodigo = "tiempo";
          if (!textoAcumulado && escriturasHechas === 0) {
            fallaPorTiempo = true;
          } else {
            const nota = `${textoAcumulado ? "\n\n" : ""}${textoCortePorTiempo(escriturasHechas)}`;
            textoAcumulado += nota;
            enviar({ chunk: nota });
          }
        }

        if (textoAcumulado) {
          await chat.guardarMensaje(supabase, user.id, sesionId, "assistant", textoAcumulado);
          respuestaGuardada = true;
          // La respuesta salió completa y quedó guardada: recién ahora cuenta como "ya se lo pregunté".
          if (contradiccionesAMarcar.length > 0 && !fallaPorTiempo && !cortePorTiempo) await marcarContradiccionesPreguntadas(supabase, contradiccionesAMarcar);
        }

        const usoNuevo = await registrarUsoIA(user.id, {
          modelo: MODELO_IA,
          inputTokens: tokensInputAcumulados,
          outputTokens: tokensOutputAcumulados,
          cacheReadTokens: tokensCacheLecturaAcumulados,
          cacheWriteTokens: tokensCacheEscrituraAcumulados,
        });
        if (usoNuevo) enviarUso(usoNuevo);
        if (fallaPorTiempo) enviar({ error: "Se me hizo largo y no pude responderte. Probá de nuevo." });
        enviarFin();
      } catch (e) {
        // Registra lo consumido hasta el turno que falló -- una excepción a
        // mitad del loop no debe perder la contabilidad de los turnos que sí
        // llegaron a completarse antes.
        medicion.resultado = "error";
        medicion.errorCodigo = clasificarError(e);
        const usoNuevo = await registrarUsoIA(user.id, {
          modelo: MODELO_IA,
          inputTokens: tokensInputAcumulados,
          outputTokens: tokensOutputAcumulados,
          cacheReadTokens: tokensCacheLecturaAcumulados,
          cacheWriteTokens: tokensCacheEscrituraAcumulados,
        });
        if (usoNuevo) enviarUso(usoNuevo);
        // Anthropic caído o sin respuesta: si el mensaje parece una emergencia,
        // igual sale el texto fijo con los teléfonos (si el modelo ya lo dijo, no se repite).
        if (emergencia && !/\b(107|911)\b/.test(textoAcumulado)) enviar({ chunk: textoEmergencia(emergencia) });
        enviar({ error: mensajeErrorProveedor(clasificarErrorProveedor(e)) });
        enviarFin();
      } finally {
        clearTimeout(temporizadorCorte);
        try {
          controller.close();
        } finally {
          cerrarRegistro(); // dispara el `after` de arriba, con la respuesta ya cerrada
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
