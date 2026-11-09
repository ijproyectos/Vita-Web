"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { MedicionesEnCasa, UsoApp } from "@/lib/perfil/tipos";
import { CLASES_COLOR } from "@/lib/familia/colores";
import type { ColorPerfil } from "@/lib/familia/tipos";
import { generarCodigoAccesoAction } from "@/app/cuidar/[elderId]/actions";
import { cantidadDeTomas, FRECUENCIAS_MEDICAMENTO } from "@/lib/medicamentos/comidas";
import type { ComidaToma, OpcionComida } from "@/lib/medicamentos/comidas";
import type { MomentoDia } from "@/lib/medicamentos/tipos";
import { ETIQUETA_MOMENTO, normalizarHora, ORDEN_MOMENTOS } from "@/lib/rutina/momento";
import { fechaISOEnAR } from "@/lib/rutina/formato";
import { VitaIcon } from "@/lib/vita-icons";
import { FilaTurno } from "@/components/vita/fila-turno";
import {
  agregarItem,
  estadoVacio,
  leerCantidadRemedios,
  marcarResultado,
  mezclarEstado,
  pendientesDeGuardar,
  proximoPaso,
  quitarItem,
  type EstadoPersona,
  type ItemLista,
  type PasoConversacion,
} from "@/lib/onboarding/conversacion";
import {
  anioDeNacimiento,
  combinarPartes,
  edadDeNacimiento,
  leerEdad,
  leerPartesFecha,
  mensajeNacimientoInvalido,
  PARTES_VACIAS,
  requiereConfirmarEdad,
  resolverNacimiento,
  textoDeNacimiento,
  type Nacimiento,
  type PartesFecha,
} from "@/lib/onboarding/nacimiento";
import { Burbuja, CampoEntrada, ChipBoton, ChipsMulti, EncabezadoConversar, PuntosEscribiendo, TarjetaCodigoCompartir, type Mensaje } from "./componentes";
import {
  crearPerfilFamiliarAction,
  extraerNombreNacimientoAction,
  finalizarOnboardingAction,
  guardarAlergiasPropiasAction,
  guardarCondicionesPropiasAction,
  guardarMedicamentoPropioAction,
  guardarMedicionesEnCasaAction,
  guardarNacimientoAction,
  guardarTurnoPropioAction,
  leerNacimientoAction,
  marcarUsoAmbosAction,
} from "./actions";
import {
  BORRADOR_VACIO,
  CHIPS_UNIDAD,
  comidasDelMomento,
  etiquetaDeToma,
  horaSugeridaSinComida,
  leerDosis,
  horasDeRemedio,
  lineaDeToma,
  remediosVisibles,
  tituloMed,
  UNIDAD_POR_CHIP,
  type BorradorMed,
} from "./medicamento-guiado";

// Onboarding conversacional nuevo (reemplaza /onboarding/nombre +
// /onboarding/chat como camino por defecto — ver pantallas/ingreso /Ingreso1-3.jpeg,
// la referencia visual/de flujo). El guion viejo (sin IA, por catálogo)
// sigue existiendo en /onboarding/nombre, pero ya no se ofrece desde la charla.
//
// Qué se pregunta lo decide UN estado por persona (`EstadoPersona`, ver
// lib/onboarding/conversacion.ts): cada respuesta lo actualiza y `avanzar`
// pregunta solo lo que todavía falta. Nada encadena "este paso, después aquel":
// por eso un dato ya dado no se vuelve a pedir, venga el flujo por donde venga.
//
// Todo el estado async vive en handlers de evento (clicks, envío del
// CampoEntrada) — nunca en el cuerpo de un efecto — así que ningún
// setState de acá dispara react-hooks/set-state-in-effect (ver
// CLAUDE.md). El único useEffect real es el de autoscroll, que no hace
// setState.

// Pasos de salud (V7 `chipsFor`). Se preguntan igual para quien está logueada
// y para la persona a cargo (en tercera persona): ambas son perfiles reales.
const OPC_CONDICIONES = ["Diabetes", "Hipertensión", "Hipotiroidismo", "Otra"] as const;
const OPC_ALERGIAS = ["Penicilina", "Aspirina", "Lactosa", "Otra"] as const;
const OPC_SOLAS = ["Ninguna", "Saltear"] as const;
const ESPECIALIDADES = ["Clínico", "Cardiólogo", "Traumatólogo", "Oculista", "Otro"] as const;
const CHIPS_CANTIDAD = ["1", "2", "3", "4", "5"] as const;

type PasoChips = "med" | "med-dosis" | "med-frecuencia" | "turno" | "turno-otro" | "turno-spec" | "meas";
const OPCIONES_CHIPS: Record<PasoChips, readonly string[]> = {
  med: ["Sí", "No", "Saltear"],
  "med-dosis": ["No sé / Saltear"],
  "med-frecuencia": FRECUENCIAS_MEDICAMENTO,
  turno: ["Sí", "No", "Saltear"],
  "turno-otro": ["Sí", "No"],
  "turno-spec": ESPECIALIDADES,
  meas: ["Presión", "Azúcar", "Las dos", "No", "Saltear"],
};

type TurnoBorrador = { especialidad: string; fecha: string; hora: string; lugar: string | null };
type RemedioResumen = { titulo: string; tomas: string[] };
type ColaMeds = { total: number; previos: string[] };

// Lo ya guardado, para la tarjeta de resumen del final.
type ResumenPropio = { cond: string[]; alergias: string[]; meds: RemedioResumen[]; turnos: TurnoBorrador[]; meas: string | null };
const RESUMEN_VACIO: ResumenPropio = { cond: [], alergias: [], meds: [], turnos: [], meas: null };

// Chip de mediciones -> valor de perfiles.mediciones_en_casa ("Saltear" no guarda nada).
const MEDICIONES_POR_CHIP: Record<string, MedicionesEnCasa | undefined> = {
  Presión: "presion",
  Azúcar: "glucemia",
  "Las dos": "ambas",
  No: "ninguna",
};

const RELACIONES = ["Mamá", "Papá", "Hijo/a", "Pareja", "Abuelo/a", "Otro"] as const;
const ETIQUETA_COLOR: Record<ColorPerfil, string> = { teal: "verde agua", violeta: "violeta", ambar: "ámbar", rosa: "rosa", azul: "azul" };

function articuloRelacion(relacion: string): string {
  if (relacion === "Mamá") return "tu mamá";
  if (relacion === "Papá") return "tu papá";
  if (relacion === "Hijo/a") return "tu hijo o hija";
  if (relacion === "Pareja") return "tu pareja";
  if (relacion === "Abuelo/a") return "tu abuela o abuelo";
  return "esa persona";
}

type Clave = "persona" | "vos";
type ContextoNacimiento = { quien: "persona"; relacion: string; nombre: string } | { quien: "vos" };
type MotivoNacimiento = "nada" | "solo-anio" | "solo-edad" | "invalido";

type Vista =
  | { tipo: "relacion" }
  | { tipo: "nombre-edad"; relacion: string }
  | { tipo: "nombre-edad-manual"; relacion: string; nombreSugerido: string; nacimientoSugerido: string }
  // Fecha de nacimiento (o edad): se pregunta, se completa UNA vez si falta algo y se sigue.
  | { tipo: "nacimiento"; ctx: ContextoNacimiento; partes: PartesFecha; edad: number | null; motivo: MotivoNacimiento; insistio: boolean }
  | { tipo: "edad-confirmar"; ctx: ContextoNacimiento; nac: Nacimiento }
  | { tipo: "consentimiento"; nombre: string; autorizado: boolean }
  // Remedios: cuántos -> uno por uno (una pregunta por vez) -> revisión de todos -> guardar todos.
  // `toma` es el índice de la toma que se está definiendo.
  | { tipo: "med-cantidad" }
  | { tipo: "med-nombre" }
  | { tipo: "med-dosis" }
  | { tipo: "med-unidad"; numero: string }
  | { tipo: "med-momento"; toma: number }
  | { tipo: "med-comida"; toma: number; momento: MomentoDia }
  | { tipo: "med-hora"; toma: number; sugerida: string; comida: ComidaToma; otra: boolean }
  | { tipo: "med-confirmar" }
  | { tipo: "med-revision" }
  | { tipo: "handoff-vos" }
  | { tipo: "multi"; paso: "cond" | "alergia"; seleccion: string[] }
  | { tipo: "chips"; paso: PasoChips }
  | { tipo: "turno-spec-texto" }
  | { tipo: "turno-fecha"; especialidad: string }
  | { tipo: "turno-lugar"; especialidad: string; fecha: string; hora: string }
  | { tipo: "turno-revision" }
  | { tipo: "resumen-propio" }
  | { tipo: "compartir" }
  // El código ya quedó en el historial; solo falta el botón para seguir.
  | { tipo: "codigo-seguir" }
  // Transición en curso (sin controles): evita tocar algo de un paso ya contestado.
  | { tipo: "espera" }
  | { tipo: "fin" };

/** La pregunta de un paso del estado: lo que dice vita y el control que se muestra. `quien` = nombre en tercera persona, o null ("vos"). */
function armarPregunta(paso: PasoConversacion, quien: string | null): { textos: string[]; vista: Vista } {
  const q = (tercera: (nombre: string) => string, propia: string) => (quien ? tercera(quien) : propia);
  switch (paso) {
    case "nacimiento":
      return {
        textos: ["¿Cuándo naciste? Escribime la fecha, por ejemplo 12/3/1950. Si preferís no decirla, salteá."],
        vista: { tipo: "nacimiento", ctx: { quien: "vos" }, partes: PARTES_VACIAS, edad: null, motivo: "nada", insistio: false },
      };
    case "condiciones":
      return {
        textos: [q((n) => `¿${n} tiene alguna condición de salud? Podés marcar varias.`, "¿Tenés alguna condición de salud? Podés marcar varias.")],
        vista: { tipo: "multi", paso: "cond", seleccion: [] },
      };
    case "alergias":
      return {
        textos: [q((n) => `¿${n} tiene alguna alergia? Podés marcar varias.`, "¿Alguna alergia? Podés marcar varias.")],
        vista: { tipo: "multi", paso: "alergia", seleccion: [] },
      };
    case "remedios":
      return {
        textos: [q((n) => `¿${n} toma algún remedio todos los días?`, "¿Tomás algún remedio todos los días?")],
        vista: { tipo: "chips", paso: "med" },
      };
    case "turnos":
      return {
        textos: [q((n) => `¿${n} tiene algún turno médico próximo?`, "¿Tenés algún turno médico próximo?")],
        vista: { tipo: "chips", paso: "turno" },
      };
    case "mediciones":
      return {
        textos: [q((n) => `¿${n} se mide la presión o el azúcar en casa?`, "¿Te medís la presión o el azúcar en casa?")],
        vista: { tipo: "chips", paso: "meas" },
      };
  }
}

function armarArranque(usoApp: UsoApp, estadoVos: EstadoPersona): { mensajes: Mensaje[]; vista: Vista } {
  if (usoApp !== "yo") {
    return {
      mensajes: [{ id: "vita-0", from: "vita", texto: "¡Hola! Soy vita. Empecemos por la persona que cuidás. ¿Quién es?" }],
      vista: { tipo: "relacion" },
    };
  }
  const retoma = JSON.stringify(estadoVos) !== JSON.stringify(estadoVacio());
  const textos = ["¡Hola! Soy vita.", retoma ? "Retomamos donde quedamos." : "Te hago unas preguntas cortas para armar tu perfil. Podés saltear cualquiera."];
  const paso = proximoPaso(estadoVos);
  let vista: Vista;
  if (!paso) {
    textos.push("Ya tengo todo lo que necesito de vos.");
    vista = { tipo: "resumen-propio" };
  } else {
    const p = armarPregunta(paso, null);
    textos.push(...p.textos);
    vista = p.vista;
  }
  return { mensajes: textos.map((texto, i) => ({ id: `vita-${i}`, from: "vita" as const, texto })), vista };
}

/** Pide lo que falta de un nacimiento a medio leer (se usa una sola vez por persona). */
function pedidoDeDetalle(ctx: ContextoNacimiento, nac: Nacimiento): string {
  const sujeto = ctx.quien === "persona" ? ctx.nombre : "vos";
  if (nac.tipo === "solo-anio") {
    return `Nació en ${nac.anio}. ¿Sabés el día y el mes? Por ejemplo 12/3. Si no, tocá "No sé el día".`;
  }
  if (nac.tipo === "solo-edad") {
    return ctx.quien === "persona"
      ? `¿Sabés la fecha de nacimiento de ${ctx.nombre}? Así le puedo avisar el día de su cumpleaños. Si solo sabés la edad, tocá "Solo sé la edad".`
      : `¿Sabés tu fecha de nacimiento? Así te puedo saludar el día de tu cumpleaños. Si solo sabés la edad, tocá "Solo sé la edad".`;
  }
  return `No llegué a leer la fecha${ctx.quien === "persona" ? ` de ${sujeto}` : ""}. Probá con día/mes/año, por ejemplo 12/3/1950, o tocá Saltear.`;
}

function etiquetaSaltearNacimiento(motivo: MotivoNacimiento): string {
  if (motivo === "solo-anio") return "No sé el día";
  if (motivo === "solo-edad") return "Solo sé la edad";
  return "Saltear";
}

export function ConversarOnboarding({ usoApp, estadoInicial }: { usoApp: UsoApp; estadoInicial: EstadoPersona }) {
  const dosTabs = usoApp !== "yo";

  const [arranque] = useState(() => armarArranque(usoApp, estadoInicial));
  const [mensajes, setMensajes] = useState<Mensaje[]>(arranque.mensajes);
  const [escribiendo, setEscribiendo] = useState(false);
  const [vista, setVista] = useState<Vista>(arranque.vista);
  const [resumen, setResumen] = useState<ResumenPropio>(RESUMEN_VACIO);
  const [hayAvance, setHayAvance] = useState(false);
  const [tabActiva, setTabActiva] = useState<"persona" | "vos">("persona");
  const [personaCompleta, setPersonaCompleta] = useState(false);
  const [nombrePersona, setNombrePersona] = useState<string | null>(null);
  const [nacimientoPersona, setNacimientoPersona] = useState<Nacimiento | null>(null);
  const [relacionPersona, setRelacionPersona] = useState<string | null>(null);
  const [colorPersona, setColorPersona] = useState<ColorPerfil>("violeta");
  const [personaId, setPersonaId] = useState<string | null>(null);

  // Qué se sabe de cada persona. El ref es la lectura síncrona dentro de un
  // mismo handler; el state solo existe para volver a renderizar.
  const estadosRef = useRef<Record<Clave, EstadoPersona>>({ persona: estadoVacio(), vos: estadoInicial });
  const [, setEstados] = useState<Record<Clave, EstadoPersona>>({ persona: estadoVacio(), vos: estadoInicial });

  const scrollRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(1);
  const [borrador, setBorrador] = useState<BorradorMed>(BORRADOR_VACIO);
  const [remedios, setRemedios] = useState<ItemLista<BorradorMed>[]>([]);
  const [cola, setCola] = useState<ColaMeds | null>(null);
  const [turnos, setTurnos] = useState<ItemLista<TurnoBorrador>[]>([]);
  // El aviso de "contar pastillas por foto" se dice una sola vez por recorrido.
  const avisoPastillasDicho = useRef(false);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [mensajes, escribiendo]);

  // Sobre quién se está preguntando: la persona a cargo (tab 1) o uno mismo
  // (tab 2, o el recorrido "yo"). `quien` es el nombre para hablar en tercera
  // persona; null = segunda persona ("vos").
  const esPersona = dosTabs && tabActiva === "persona";
  const clave: Clave = esPersona ? "persona" : "vos";
  const quien = esPersona ? nombrePersona ?? "esa persona" : null;
  const q = (tercera: (nombre: string) => string, propia: string) => (quien ? tercera(quien) : propia);

  function nuevoId(): string {
    return `m-${idRef.current++}`;
  }

  function agregarBurbujaUsuario(texto: string, audioSeg?: number) {
    setMensajes((prev) => [...prev, { id: nuevoId(), from: "user", texto, audioSeg }]);
  }

  function agregarBurbujaVita(texto: string) {
    setMensajes((prev) => [...prev, { id: nuevoId(), from: "vita", texto }]);
  }

  // Deja un widget en el historial como tarjeta de solo lectura.
  function agregarTarjeta(tarjeta: ReactNode) {
    setMensajes((prev) => [...prev, { id: nuevoId(), from: "vita", texto: "", tarjeta }]);
  }

  function decir(...textos: string[]) {
    const nuevos: Mensaje[] = textos.map((texto) => ({ id: nuevoId(), from: "vita", texto }));
    setMensajes((prev) => [...prev, ...nuevos]);
  }

  // ---- Estado de lo ya respondido -------------------------------------------

  function actualizarEstado(c: Clave, parcial: Partial<EstadoPersona>) {
    estadosRef.current = { ...estadosRef.current, [c]: mezclarEstado(estadosRef.current[c], parcial) };
    setEstados(estadosRef.current);
  }

  // Una persona nueva arranca de cero (la anterior ya quedó guardada).
  function reiniciarEstado(c: Clave, parcial: Partial<EstadoPersona>) {
    estadosRef.current = { ...estadosRef.current, [c]: mezclarEstado(estadoVacio(), parcial) };
    setEstados(estadosRef.current);
  }

  /** Pregunta lo PRIMERO que falta de esa persona; si no falta nada, cierra con el resumen. */
  function avanzar(c: Clave, previos: string[] = []) {
    const paso = proximoPaso(estadosRef.current[c]);
    if (!paso) {
      if (previos.length) decir(...previos);
      mostrarResumenFinal(c);
      return;
    }
    const pregunta = armarPregunta(paso, c === "persona" ? nombrePersona ?? "esa persona" : null);
    decir(...previos, ...pregunta.textos);
    setVista(pregunta.vista);
  }

  // ---- Paso "relación" ----------------------------------------------------

  function elegirRelacion(relacion: string) {
    agregarBurbujaUsuario(relacion);
    agregarBurbujaVita(`¿Cómo se llama ${articuloRelacion(relacion)} y cuándo nació? Si no sabés la fecha, decime la edad.`);
    setVista({ tipo: "nombre-edad", relacion });
  }

  // ---- Paso "nombre + nacimiento" -------------------------------------------

  async function responderNombreNacimiento(relacion: string, texto: string, audioSeg?: number) {
    agregarBurbujaUsuario(texto, audioSeg);
    setEscribiendo(true);

    const resultado = await extraerNombreNacimientoAction(texto, relacion).catch(
      () => ({ status: "error", message: "revisá tu conexión e intentá de nuevo" }) as const
    );
    setEscribiendo(false);

    if (resultado.status === "error") {
      // Lo que ya vino escrito (una fecha, una edad) se conserva para el formulario.
      const hoy = fechaISOEnAR();
      const leido = resolverNacimiento(leerPartesFecha(texto, hoy), leerEdad(texto), hoy);
      agregarBurbujaVita("No llegué a entender bien el nombre — ¿me lo escribís tal cual, por las dudas?");
      setVista({ tipo: "nombre-edad-manual", relacion, nombreSugerido: "", nacimientoSugerido: textoDeNacimiento(leido) });
      return;
    }

    await decidirNacimiento({ quien: "persona", relacion, nombre: resultado.nombre }, resultado.partes, resultado.edad, false);
  }

  // Formulario manual (cuando falló la lectura o la creación): nombre + fecha/edad en texto.
  async function enviarFormularioManual(relacion: string, nombre: string, textoNacimiento: string) {
    let partes: PartesFecha = PARTES_VACIAS;
    let edad: number | null = null;
    if (textoNacimiento.trim()) {
      setEscribiendo(true);
      const r = await leerNacimientoAction(textoNacimiento).catch(() => null);
      setEscribiendo(false);
      if (r && r.status === "success") {
        partes = r.partes;
        edad = r.edad;
      }
    }
    await decidirNacimiento({ quien: "persona", relacion, nombre }, partes, edad, false);
  }

  // Resuelve lo leído: lo inválido se vuelve a pedir; lo incompleto (solo año /
  // solo edad / nada) se completa UNA vez; con eso se cierra.
  async function decidirNacimiento(ctx: ContextoNacimiento, partes: PartesFecha, edad: number | null, insistio: boolean) {
    const nac = resolverNacimiento(partes, edad, fechaISOEnAR());

    if (nac.tipo === "invalido") {
      decir(`${mensajeNacimientoInvalido(nac.motivo)} ¿Me la escribís de nuevo? Por ejemplo 12/3/1950.`);
      setVista({ tipo: "nacimiento", ctx, partes: PARTES_VACIAS, edad: null, motivo: "invalido", insistio });
      return;
    }
    if (!insistio && nac.tipo !== "fecha") {
      decir(pedidoDeDetalle(ctx, nac));
      setVista({ tipo: "nacimiento", ctx, partes, edad, motivo: nac.tipo, insistio: true });
      return;
    }
    await cerrarNacimiento(ctx, nac);
  }

  // Una edad por encima de lo razonable se confirma antes de guardar nada.
  async function cerrarNacimiento(ctx: ContextoNacimiento, nac: Nacimiento) {
    if (requiereConfirmarEdad(nac)) {
      const nombre = ctx.quien === "persona" ? ctx.nombre : null;
      agregarBurbujaVita(`¿${nombre ? `${nombre} tiene` : "Tenés"} ${edadDeNacimiento(nac)} años? Me parece mucho, ¿lo pusiste bien?`);
      setVista({ tipo: "edad-confirmar", ctx, nac });
      return;
    }
    await fijarNacimiento(ctx, nac);
  }

  async function fijarNacimiento(ctx: ContextoNacimiento, nac: Nacimiento) {
    if (ctx.quien === "persona") {
      await crearPerfilYSeguir(ctx.relacion, ctx.nombre, nac);
      return;
    }
    const anio = anioDeNacimiento(nac, fechaISOEnAR());
    const guardar = nac.tipo === "fecha" ? { fecha: nac.fecha } : anio !== null && (nac.tipo === "solo-anio" || nac.tipo === "solo-edad") ? { anio } : null;
    if (guardar) {
      setEscribiendo(true);
      const r = await guardarNacimientoAction(guardar).catch(() => ({ status: "error", message: "" }) as const);
      setEscribiendo(false);
      if (r.status === "error") toast.error("No pudimos guardar tu fecha de nacimiento, la podés cargar después desde tu perfil.");
      else setHayAvance(true);
    }
    actualizarEstado("vos", { nacimiento: nac, nacimientoRespondido: true });
    avanzar("vos", [guardar ? "Anotado." : "Dale, seguimos."]);
  }

  async function responderNacimiento(v: Extract<Vista, { tipo: "nacimiento" }>, texto: string, audioSeg?: number) {
    agregarBurbujaUsuario(texto, audioSeg);
    setEscribiendo(true);
    const r = await leerNacimientoAction(texto).catch(() => null);
    setEscribiendo(false);
    if (!r || r.status === "error") {
      decir("No te entendí. Escribime la fecha como día/mes/año, por ejemplo 12/3/1950.");
      return;
    }
    // Una fecha inválida se pide de cero; una incompleta se completa con lo que ya se sabía.
    const reinicia = v.motivo === "invalido";
    await decidirNacimiento(v.ctx, combinarPartes(reinicia ? PARTES_VACIAS : v.partes, r.partes), r.edad ?? (reinicia ? null : v.edad), v.insistio);
  }

  async function saltearNacimiento(v: Extract<Vista, { tipo: "nacimiento" }>) {
    agregarBurbujaUsuario(etiquetaSaltearNacimiento(v.motivo));
    const nac = resolverNacimiento(v.partes, v.edad, fechaISOEnAR());
    await cerrarNacimiento(v.ctx, nac.tipo === "invalido" ? { tipo: "nada" } : nac);
  }

  // Crear el perfil abre una cuenta real: un doble toque no puede crear dos.
  const creandoPerfil = useRef(false);

  async function crearPerfilYSeguir(relacion: string, nombre: string, nac: Nacimiento) {
    if (creandoPerfil.current) return;
    creandoPerfil.current = true;
    setEscribiendo(true);
    const anio = anioDeNacimiento(nac, fechaISOEnAR());
    const nacimiento = nac.tipo === "fecha" ? { fecha: nac.fecha } : anio !== null && (nac.tipo === "solo-anio" || nac.tipo === "solo-edad") ? { anio } : null;
    const creado = await crearPerfilFamiliarAction({ nombre, relacion, nacimiento, reutilizarId: personaId }).catch(
      () => ({ status: "error", message: "revisá tu conexión e intentá de nuevo" }) as const
    );
    setEscribiendo(false);
    creandoPerfil.current = false;

    if (creado.status === "error") {
      toast.error(`No pudimos crear el perfil: ${creado.message}`);
      // Se conserva todo lo que ya había dicho: nombre y nacimiento.
      setVista({ tipo: "nombre-edad-manual", relacion, nombreSugerido: nombre, nacimientoSugerido: textoDeNacimiento(nac) });
      return;
    }

    agregarBurbujaVita(
      `Perfecto, voy a crear el perfil de ${nombre}. Le asigno el color ${ETIQUETA_COLOR[creado.color]} para que siempre sepas cuándo estás viendo lo suyo.`
    );
    setHayAvance(true);
    setNombrePersona(nombre);
    setNacimientoPersona(nac.tipo === "nada" || nac.tipo === "invalido" ? null : nac);
    setRelacionPersona(relacion);
    setColorPersona(creado.color);
    setPersonaId(creado.id);
    // La persona nueva ya tiene nacimiento respondido: no se le vuelve a preguntar.
    reiniciarEstado("persona", { nacimiento: nac, nacimientoRespondido: true });

    window.setTimeout(() => {
      agregarBurbujaVita("Antes de seguir, necesito que me confirmes una cosa. Son datos de salud, así que los cuidamos mucho.");
      setVista({ tipo: "consentimiento", nombre, autorizado: false });
    }, 450);
  }

  function confirmarConsentimiento(nombre: string) {
    agregarTarjeta(<TarjetaConsentimiento nombre={nombre} autorizado onToggle={() => {}} onConfirmar={() => {}} congelada />);
    avanzar("persona");
  }

  // ---- Remedios (persona o "vos") -------------------------------------------
  // "Sí" -> ¿cuántos? (un número o la lista) -> por cada uno: nombre -> dosis
  // (-> unidad si vino un número pelado) -> veces por día -> por cada toma:
  // momento -> comida -> hora -> tarjeta -> revisión de TODOS -> guardar todos.

  function empezarRemedios() {
    decir(
      q(
        (n) => `¿Cuántos remedios toma ${n}? Tocá un número, o escribime la lista (por ejemplo: Losartán, Metformina).`,
        "¿Cuántos remedios tomás? Tocá un número, o escribime la lista (por ejemplo: Losartán, Metformina)."
      )
    );
    setVista({ tipo: "med-cantidad" });
  }

  function responderCantidadMeds(texto: string, audioSeg?: number) {
    agregarBurbujaUsuario(texto, audioSeg);
    const lectura = leerCantidadRemedios(texto);
    if (lectura.tipo === "ilegible") {
      decir("No lo entendí. Tocá un número del 1 al 5, o escribime los nombres separados por coma.");
      return;
    }
    const nueva: ColaMeds = lectura.tipo === "cantidad" ? { total: lectura.total, previos: [] } : { total: lectura.nombres.length, previos: lectura.nombres };
    setCola(nueva);
    pedirRemedio(nueva, remedios.length);
  }

  // Arranca el remedio número `indice` (0-based) de la cola.
  function pedirRemedio(c: ColaMeds, indice: number) {
    const previo = c.previos[indice];
    const prefijo = c.total > 1 ? `Remedio ${indice + 1} de ${c.total}: ` : "";
    if (previo) {
      setBorrador({ ...BORRADOR_VACIO, nombre: previo });
      decir(`${prefijo}¿de cuánto es el ${previo}? Por ejemplo, 50 mg.`);
      setVista({ tipo: "med-dosis" });
      return;
    }
    setBorrador(BORRADOR_VACIO);
    decir(prefijo + q((n) => `¿Cómo se llama el remedio de ${n}?`, "¿Cómo se llama el remedio?"));
    setVista({ tipo: "med-nombre" });
  }

  function responderNombreMed(texto: string, audioSeg?: number) {
    agregarBurbujaUsuario(texto, audioSeg);
    const t = texto.trim();
    const nombre = t.charAt(0).toUpperCase() + t.slice(1);
    setBorrador((b) => ({ ...b, nombre }));
    decir(`¿De cuánto es el ${nombre}? Por ejemplo, 50 mg.`);
    setVista({ tipo: "med-dosis" });
  }

  function preguntarFrecuencia() {
    decir(q((n) => `¿Cuántas veces por día lo toma ${n}?`, "¿Cuántas veces por día lo tomás?"));
    setVista({ tipo: "chips", paso: "med-frecuencia" });
  }

  function responderDosisMed(texto: string, audioSeg?: number) {
    agregarBurbujaUsuario(texto, audioSeg);
    const lectura = leerDosis(texto);
    if (lectura.tipo === "ilegible") {
      decir("No la entendí. Escribime la cantidad con la unidad, por ejemplo 50 mg, o tocá \"No sé\".");
      return;
    }
    if (lectura.tipo === "sin-unidad") {
      decir(`¿${lectura.numero} mg?`);
      setVista({ tipo: "med-unidad", numero: lectura.numero });
      return;
    }
    setBorrador((b) => ({ ...b, dosis: lectura.valor, unidad: lectura.unidad }));
    preguntarFrecuencia();
  }

  function responderUnidadMed(numero: string, chip: string) {
    agregarBurbujaUsuario(chip);
    setBorrador((b) => ({ ...b, dosis: numero, unidad: UNIDAD_POR_CHIP[chip] ?? "mg" }));
    preguntarFrecuencia();
  }

  function preguntarMomentoToma(toma: number, total: number) {
    const cual = etiquetaDeToma(toma, total);
    decir(cual ? `${cual[0].toUpperCase()}${cual.slice(1)}: ¿en qué momento del día?` : "¿En qué momento del día?");
    setVista({ tipo: "med-momento", toma });
  }

  function responderFrecuenciaMed(frecuencia: string) {
    setBorrador((b) => ({ ...b, frecuencia, tomas: [] }));
    preguntarMomentoToma(0, cantidadDeTomas(frecuencia));
  }

  function responderMomentoMed(toma: number, momento: MomentoDia) {
    agregarBurbujaUsuario(ETIQUETA_MOMENTO[momento]);
    decir("¿Con qué comida?");
    setVista({ tipo: "med-comida", toma, momento });
  }

  function responderComidaMed(toma: number, momento: MomentoDia, opcion: OpcionComida | null) {
    agregarBurbujaUsuario(opcion?.etiqueta ?? "No importa");
    // La hora sugerida es aproximada: la que se confirme manda y la indicación queda como se eligió.
    const sugerida = opcion?.hora ?? horaSugeridaSinComida(momento);
    decir("¿A qué hora exactamente?");
    setVista({ tipo: "med-hora", toma, sugerida, comida: { conComida: opcion?.conComida ?? "no-importa", indicacion: opcion?.clave ?? null }, otra: false });
  }

  function responderHoraMed(v: Extract<Vista, { tipo: "med-hora" }>, hora: string) {
    const normal = normalizarHora(hora);
    if (!normal) {
      toast.error("Esa hora no es válida.");
      return;
    }
    if (borrador.tomas.some((t, i) => i !== v.toma && t.hora === normal)) {
      toast.error("Esa hora ya la usaste en otra toma. Elegí otra.");
      return;
    }
    agregarBurbujaUsuario(normal);
    const tomas = [...borrador.tomas.slice(0, v.toma), { hora: normal, ...v.comida }];
    setBorrador((b) => ({ ...b, tomas }));

    const total = cantidadDeTomas(borrador.frecuencia);
    if (tomas.length < total) {
      preguntarMomentoToma(tomas.length, total);
      return;
    }
    decir("Revisá que esté bien:");
    setVista({ tipo: "med-confirmar" });
  }

  const etiquetaPara = esPersona ? nombrePersona ?? "la persona que cuidás" : "vos";

  function editarMedicamento() {
    agregarTarjeta(<TarjetaConfirmarMed borrador={borrador} etiquetaPara={etiquetaPara} congelada="editado" />);
    agregarBurbujaUsuario("Editar");
    decir("Dale, lo cargamos de nuevo.");
    pedirRemedio(cola ?? { total: remedios.length + 1, previos: [] }, remedios.length);
  }

  // "Listo" en la tarjeta de UN remedio: pasa a la lista. Si faltan según la
  // cantidad dicha se sigue con el próximo; si no, se revisan todos juntos.
  function confirmarRemedio() {
    agregarTarjeta(<TarjetaConfirmarMed borrador={borrador} etiquetaPara={etiquetaPara} congelada="anotado" />);
    agregarBurbujaUsuario("Listo");
    const nueva = agregarItem(remedios, nuevoId(), borrador);
    setRemedios(nueva);
    const c = cola ?? { total: nueva.length, previos: [] };
    if (nueva.length < c.total) {
      pedirRemedio(c, nueva.length);
      return;
    }
    if (!avisoPastillasDicho.current) {
      avisoPastillasDicho.current = true;
      decir("Si querés llevar la cuenta de cuántas pastillas quedan, después lo podés hacer desde Mis pastillas: le sacás una foto al blíster y las cuento yo.");
    }
    decir(nueva.length > 1 ? "Estos son todos los remedios. Podés quitar alguno o agregar otro antes de guardar:" : "Revisá la lista. Si falta alguno, agregalo antes de guardar:");
    setVista({ tipo: "med-revision" });
  }

  function agregarOtroRemedio() {
    agregarBurbujaUsuario("Agregar otro");
    const c: ColaMeds = { total: remedios.length + 1, previos: [] };
    setCola(c);
    pedirRemedio(c, remedios.length);
  }

  // Un doble toque en "Guardar" no puede crear los remedios dos veces.
  const guardandoMed = useRef(false);

  async function guardarTodosRemedios() {
    if (guardandoMed.current) return;
    if (esPersona && !personaId) {
      toast.error("No encontramos el perfil de la persona. Recargá la página.");
      return;
    }
    guardandoMed.current = true;
    setEscribiendo(true);
    let lista = remedios;
    const nuevos: RemedioResumen[] = [];
    for (const item of pendientesDeGuardar(lista)) {
      const b = item.datos;
      const r = await guardarMedicamentoPropioAction(
        {
          nombre: b.nombre,
          dosis: b.dosis,
          unidad: b.unidad,
          frecuencia: b.frecuencia || null,
          tomas: b.tomas.map((t) => ({ hora: t.hora, conComida: t.conComida, indicacion: t.indicacion })),
        },
        esPersona ? (personaId as string) : undefined
      ).catch(() => ({ status: "error", message: "revisá tu conexión e intentá de nuevo" }) as const);
      lista = marcarResultado(lista, item.id, r.status === "success" ? { ok: true } : { ok: false, error: r.message });
      if (r.status === "success") nuevos.push({ titulo: tituloMed(b), tomas: b.tomas.map(lineaDeToma) });
    }
    setRemedios(lista);
    setEscribiendo(false);
    guardandoMed.current = false;

    if (nuevos.length > 0) {
      setHayAvance(true);
      setResumen((r) => ({ ...r, meds: [...r.meds, ...nuevos] }));
    }
    const fallaron = lista.filter((i) => !i.guardado);
    if (fallaron.length > 0) {
      // Nada se descarta en silencio: los que fallaron quedan en la lista con su error para reintentar o quitar.
      toast.error(`No se pudo guardar: ${fallaron.map((i) => i.datos.nombre).join(", ")}.`);
      return;
    }
    agregarTarjeta(<TarjetaRevisionRemedios items={lista} etiquetaPara={etiquetaPara} congelada />);
    agregarBurbujaUsuario(lista.length > 0 ? "Guardar todo" : "Seguir sin remedios");
    actualizarEstado(clave, { remediosRespondido: true });
    setRemedios([]);
    setCola(null);
    avanzar(clave, [lista.length > 0 ? "Anotado." : "Dale."]);
  }

  async function irAVosAhora() {
    agregarBurbujaUsuario("Sumarme yo");
    setTabActiva("vos");
    // uso_app pasa a "ambos". Si falla no se corta el chat: "cuido" y
    // "ambos" llevan al mismo destino (vincular-cuidado).
    const r = await marcarUsoAmbosAction();
    if (r.status === "error") toast.error("No pudimos actualizar tu perfil de uso, seguimos igual.");
    setResumen(RESUMEN_VACIO);
    setRemedios([]);
    setTurnos([]);
    setCola(null);
    decir("¡Genial! Ahora vos.");
    avanzar("vos");
  }

  async function irADespues() {
    await terminarTodo();
  }

  // ---- Compartir código con la persona a cargo (V7 `f_share`) ------------------

  const generandoCodigo = useRef(false);

  async function compartirCodigo() {
    if (!personaId || generandoCodigo.current) return;
    generandoCodigo.current = true;
    agregarBurbujaUsuario("Compartir código");
    setEscribiendo(true);
    const r = await generarCodigoAccesoAction(personaId).catch(() => null);
    setEscribiendo(false);
    generandoCodigo.current = false;

    if (!r || r.status === "error") {
      toast.error(r?.message ?? "No pudimos generar el código. Probá de nuevo.");
      return;
    }
    const nombre = nombrePersona ?? "esa persona";
    // La hora de vencimiento viene del servidor; la tarjeta queda en el historial.
    const venceA = new Date(r.expiraAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });
    agregarTarjeta(resumenPersonaCongelado());
    decir(`Listo, este es el código para ${nombre}.`);
    agregarTarjeta(<TarjetaCodigoCompartir nombre={nombre} codigo={r.codigo} venceA={venceA} />);
    setVista({ tipo: "codigo-seguir" });
  }

  function resumenPersonaCongelado() {
    return <TarjetaResumenPropia resumen={resumen} titulo={`Perfil de ${nombrePersona ?? "la persona"}`} sub={subPersona(relacionPersona, nacimientoPersona)} color={colorPersona} />;
  }

  function seguirTrasCodigo() {
    agregarBurbujaUsuario("Seguir");
    preguntarSumarse();
  }

  function noCompartirAhora() {
    // Sin controles desde ya: la pregunta siguiente llega con demora y no se puede
    // tocar "Compartir código" mientras tanto.
    setVista({ tipo: "espera" });
    agregarTarjeta(resumenPersonaCongelado());
    agregarBurbujaUsuario("Ahora no");
    decir(`Vos manejás el perfil de ${nombrePersona ?? "esa persona"} y, si después querés, se lo compartís desde Familia.`);
    preguntarSumarse();
  }

  function preguntarSumarse() {
    setVista({ tipo: "espera" });
    setPersonaCompleta(true);
    window.setTimeout(() => {
      agregarBurbujaVita("¿Querés sumarte vos también?");
      setVista({ tipo: "handoff-vos" });
    }, 650);
  }

  // ---- Salud: condiciones y alergias ------------------------------------------

  function alternarMulti(opcion: string) {
    setVista((v) =>
      v.tipo === "multi"
        ? { ...v, seleccion: v.seleccion.includes(opcion) ? v.seleccion.filter((x) => x !== opcion) : [...v.seleccion, opcion] }
        : v
    );
  }

  async function responderMulti(paso: "cond" | "alergia", seleccion: string[], sola?: string) {
    agregarBurbujaUsuario(sola ?? seleccion.join(" · "));
    const reales = sola ? [] : seleccion.filter((x) => x !== "Otra");
    const soloOtra = !sola && reales.length === 0;

    if (reales.length > 0) {
      setEscribiendo(true);
      const destino = esPersona ? personaId ?? undefined : undefined;
      if (esPersona && !destino) {
        setEscribiendo(false);
        toast.error("No encontramos el perfil de la persona. Recargá la página.");
        return;
      }
      const r = paso === "cond" ? await guardarCondicionesPropiasAction(reales, destino) : await guardarAlergiasPropiasAction(reales, destino);
      setEscribiendo(false);
      if (r.status === "error") {
        toast.error(`No se pudo guardar: ${r.message}`);
      } else {
        setHayAvance(true);
        setResumen((prev) => (paso === "cond" ? { ...prev, cond: [...prev.cond, ...reales] } : { ...prev, alergias: [...prev.alergias, ...reales] }));
      }
    }

    const lista = reales.join(", ");
    // Respondida (aunque sea "Ninguna"/"Saltear"): no se vuelve a preguntar.
    if (paso === "cond") {
      actualizarEstado(clave, { condiciones: reales });
      avanzar(clave, [sola ? "Perfecto, seguimos." : soloOtra ? "Anotado, después la completás en el perfil." : `Anotado: ${lista}. Lo voy a tener en cuenta en los controles.`]);
    } else {
      actualizarEstado(clave, { alergias: reales });
      avanzar(clave, [sola ? "Buenísimo." : soloOtra ? "Anotado, después la completás en el perfil." : `Anotado: ${lista}. Te aviso si algo choca con eso.`]);
    }
  }

  function responderChip(paso: PasoChips, valor: string) {
    agregarBurbujaUsuario(valor);
    const omitido = valor === "Saltear" || valor === "No";

    switch (paso) {
      case "med":
        if (valor === "Sí") {
          empezarRemedios();
        } else {
          actualizarEstado(clave, { remediosRespondido: true });
          avanzar(clave, [valor === "Saltear" ? "Perfecto." : "Buenísimo."]);
        }
        break;
      case "med-dosis":
        // "No sé / Saltear": el remedio queda sin dosis.
        setBorrador((b) => ({ ...b, dosis: null, unidad: "mg" }));
        preguntarFrecuencia();
        break;
      case "med-frecuencia":
        responderFrecuenciaMed(valor);
        break;
      case "turno":
        if (valor === "Sí") {
          decir("¿Con qué médico?");
          setVista({ tipo: "chips", paso: "turno-spec" });
        } else {
          actualizarEstado(clave, { turnosRespondido: true });
          avanzar(clave, [valor === "Saltear" ? "Perfecto." : "Buenísimo."]);
        }
        break;
      case "turno-otro":
        if (valor === "Sí") {
          decir("¿Con qué médico?");
          setVista({ tipo: "chips", paso: "turno-spec" });
        } else {
          decir(turnos.length > 1 ? "Estos son los turnos. Podés quitar alguno antes de guardar:" : "Revisá el turno antes de guardar:");
          setVista({ tipo: "turno-revision" });
        }
        break;
      case "turno-spec":
        if (valor === "Otro") {
          decir("¿Con qué especialidad?");
          setVista({ tipo: "turno-spec-texto" });
        } else {
          pedirFechaTurno(valor);
        }
        break;
      case "meas": {
        const guardar = MEDICIONES_POR_CHIP[valor];
        if (guardar && esPersona && !personaId) {
          // Sin el id de la persona no se guarda: iría al perfil propio.
          toast.error("No encontramos el perfil de la persona. Recargá la página.");
        } else if (guardar) {
          void guardarMedicionesEnCasaAction(guardar, esPersona ? personaId ?? undefined : undefined).then((r) => {
            if (r.status === "error") toast.error("No pudimos guardar esa respuesta, la podés cargar después.");
          }, () => toast.error("No pudimos guardar esa respuesta, la podés cargar después."));
        }
        setResumen((prev) => ({ ...prev, meas: omitido ? null : valor === "Las dos" ? "Presión · Azúcar" : valor }));
        actualizarEstado(clave, { medicionesRespondido: true });
        avanzar(clave, [omitido ? "Dale." : "Perfecto, cuando quieras anotar una medición, hablame y la guardo."]);
        break;
      }
    }
  }

  // ---- Turnos: uno o varios, se confirman todos juntos ------------------------

  function pedirFechaTurno(especialidad: string) {
    decir("¿Cuándo es? Elegí el día y la hora.");
    setVista({ tipo: "turno-fecha", especialidad });
  }

  function responderEspecialidad(texto: string) {
    agregarBurbujaUsuario(texto);
    pedirFechaTurno(texto);
  }

  function confirmarFechaTurno(especialidad: string, fecha: string, hora: string) {
    if (fecha < fechaISOEnAR()) {
      toast.error("Esa fecha ya pasó. Elegí un día de hoy en adelante.");
      return;
    }
    agregarBurbujaUsuario(`${fecha.split("-").reverse().join("/")} · ${hora}`);
    decir("¿Dónde es? Escribí el lugar o la dirección.");
    setVista({ tipo: "turno-lugar", especialidad, fecha, hora });
  }

  // El turno pasa a la lista (todavía no se guarda) y se pregunta si hay otro.
  function agregarTurnoALista(v: { especialidad: string; fecha: string; hora: string }, lugar: string | null) {
    agregarBurbujaUsuario(lugar ?? "Lo cargo después");
    setTurnos((prev) => agregarItem(prev, nuevoId(), { ...v, lugar }));
    decir(q((n) => `Anotado. ¿${n} tiene algún otro turno?`, "Anotado. ¿Tenés algún otro turno?"));
    setVista({ tipo: "chips", paso: "turno-otro" });
  }

  function agregarOtroTurno() {
    agregarBurbujaUsuario("Agregar otro");
    decir("¿Con qué médico?");
    setVista({ tipo: "chips", paso: "turno-spec" });
  }

  const guardandoTurnos = useRef(false);

  async function guardarTodosTurnos() {
    if (guardandoTurnos.current) return;
    if (esPersona && !personaId) {
      toast.error("No encontramos el perfil de la persona. Recargá la página.");
      return;
    }
    guardandoTurnos.current = true;
    setEscribiendo(true);
    let lista = turnos;
    const nuevos: TurnoBorrador[] = [];
    for (const item of pendientesDeGuardar(lista)) {
      const r = await guardarTurnoPropioAction(item.datos, esPersona ? (personaId as string) : undefined).catch(
        () => ({ status: "error", message: "revisá tu conexión e intentá de nuevo" }) as const
      );
      lista = marcarResultado(lista, item.id, r.status === "success" ? { ok: true } : { ok: false, error: r.message });
      if (r.status === "success") nuevos.push(item.datos);
    }
    setTurnos(lista);
    setEscribiendo(false);
    guardandoTurnos.current = false;

    if (nuevos.length > 0) {
      setHayAvance(true);
      setResumen((r) => ({ ...r, turnos: [...r.turnos, ...nuevos] }));
    }
    const fallaron = lista.filter((i) => !i.guardado);
    if (fallaron.length > 0) {
      toast.error(`No se pudo guardar: ${fallaron.map((i) => i.datos.especialidad).join(", ")}.`);
      return;
    }
    agregarTarjeta(<TarjetaRevisionTurnos items={lista} etiquetaPara={etiquetaPara} congelada />);
    agregarBurbujaUsuario(lista.length > 0 ? "Guardar todo" : "Seguir sin turnos");
    actualizarEstado(clave, { turnosRespondido: true });
    setTurnos([]);
    avanzar(clave, [lista.length > 0 ? "Anotado. Te aviso el día antes y esa mañana." : "Dale."]);
  }

  function mostrarResumenFinal(c: Clave) {
    if (c === "persona") {
      const nombre = nombrePersona ?? "esa persona";
      decir(
        `¡Listo, el perfil de ${nombre} está creado! ¿Querés compartirle un código a ${nombre}? Así ve sus remedios y turnos desde su celu, y vos te enterás si los toma.`
      );
      setVista({ tipo: "compartir" });
      return;
    }
    decir("¡Listo, tu perfil está creado! Todo lo demás lo podés completar cuando quieras.");
    setVista({ tipo: "resumen-propio" });
  }

  // Fin del recorrido propio: marca onboarding completo y sigue al permiso.
  async function terminarTodo(tarjeta?: ReactNode) {
    const r = await finalizarOnboardingAction();
    if (r?.status === "error") {
      toast.error("No pudimos guardar. Probá de nuevo.");
      return;
    }
    if (tarjeta) agregarTarjeta(tarjeta);
    setVista({ tipo: "fin" });
  }

  // "Terminar después" (V7 `skipChat`): cierra con lo que ya se guardó.
  async function terminarDespues() {
    await terminarTodo();
  }
  const tabs = dosTabs
    ? [
        {
          label: personaCompleta ? `1 · ${nombrePersona ?? "Persona"} ✓` : `1 · ${nombrePersona ?? "La persona que cuidás"}`,
          estado: (personaCompleta ? "completo" : tabActiva === "persona" ? "activo" : "inactivo") as "activo" | "inactivo" | "completo",
          color: colorPersona,
        },
        { label: "2 · Vos", estado: (tabActiva === "vos" ? "activo" : "inactivo") as "activo" | "inactivo", color: "teal" as const },
      ]
    : [];

  // Barra de entrada fija abajo (V7): activa solo en los pasos de texto libre,
  // inerte ("Elegí una opción") cuando el paso se responde con chips/tarjetas.
  const placeholderCampo = escribiendo ? null : placeholderDelPaso(vista);

  function enviarDesdeCampo(texto: string, audioSeg?: number) {
    if (vista.tipo === "nombre-edad") void responderNombreNacimiento(vista.relacion, texto, audioSeg);
    else if (vista.tipo === "nacimiento") void responderNacimiento(vista, texto, audioSeg);
    else if (vista.tipo === "med-cantidad") responderCantidadMeds(texto, audioSeg);
    else if (vista.tipo === "med-nombre") responderNombreMed(texto, audioSeg);
    else if (vista.tipo === "med-dosis") responderDosisMed(texto, audioSeg);
    else if (vista.tipo === "turno-spec-texto") responderEspecialidad(texto);
    else if (vista.tipo === "turno-lugar") agregarTurnoALista(vista, texto);
  }

  return (
    <div className="mx-auto flex h-dvh w-full max-w-md flex-col bg-canvas">
      {/* /onboarding/nombre, no /onboarding/chat directo -- conserva el paso
          de nombre del guion viejo en vez de saltarlo (el perfil ya viene
          con el nombre de Google, pero así la persona lo puede corregir
          antes de seguir, como en el flujo original). */}
      <EncabezadoConversar
        tabs={tabs}
        escribiendo={escribiendo}
        hayAvance={hayAvance}
        onTerminar={() => {
          if (vista.tipo !== "fin") void terminarDespues();
        }}
      />

      <div ref={scrollRef} className="flex flex-1 flex-col gap-2.5 overflow-y-auto px-4 pb-3.5 pt-[18px]">
        {mensajes.map((m, i) =>
          m.tarjeta ? (
            <div key={m.id} className="pl-[46px]">
              {m.tarjeta}
            </div>
          ) : (
            <Burbuja key={m.id} m={m} conAvatar={mensajes[i + 1] ? mensajes[i + 1].from !== "vita" || Boolean(mensajes[i + 1].tarjeta) : !escribiendo} />
          )
        )}
        {escribiendo && <PuntosEscribiendo />}

        {!escribiendo && vista.tipo === "relacion" && (
          <div className="flex flex-wrap gap-1.5 pl-[46px]">
            {RELACIONES.map((r) => (
              <ChipBoton key={r} texto={r} onClick={() => elegirRelacion(r)} />
            ))}
          </div>
        )}

        {!escribiendo && vista.tipo === "nombre-edad-manual" && (
          <div className="pl-[46px]">
            <FormularioNombreManual
              relacion={vista.relacion}
              nombreInicial={vista.nombreSugerido}
              nacimientoInicial={vista.nacimientoSugerido}
              onGuardar={(nombre, textoNacimiento) => enviarFormularioManual(vista.relacion, nombre, textoNacimiento)}
            />
          </div>
        )}

        {!escribiendo && vista.tipo === "nacimiento" && (
          <div className="flex flex-wrap gap-1.5 pl-[46px]">
            <ChipBoton texto={etiquetaSaltearNacimiento(vista.motivo)} onClick={() => void saltearNacimiento(vista)} />
          </div>
        )}

        {!escribiendo && vista.tipo === "edad-confirmar" && (
          <div className="flex flex-wrap gap-1.5 pl-[46px]">
            <ChipBoton
              texto="Sí, es correcto"
              onClick={() => {
                agregarBurbujaUsuario("Sí, es correcto");
                void fijarNacimiento(vista.ctx, vista.nac);
              }}
            />
            <ChipBoton
              texto="Corregir"
              onClick={() => {
                agregarBurbujaUsuario("Corregir");
                agregarBurbujaVita("¿Cuál es la fecha de nacimiento o la edad correcta?");
                setVista({ tipo: "nacimiento", ctx: vista.ctx, partes: PARTES_VACIAS, edad: null, motivo: "invalido", insistio: true });
              }}
            />
          </div>
        )}

        {!escribiendo && vista.tipo === "consentimiento" && (
          <div className="pl-[46px]">
            <TarjetaConsentimiento
              nombre={vista.nombre}
              autorizado={vista.autorizado}
              onToggle={(v) => setVista((prev) => (prev.tipo === "consentimiento" ? { ...prev, autorizado: v } : prev))}
              onConfirmar={() => confirmarConsentimiento(vista.nombre)}
            />
          </div>
        )}

        {!escribiendo && vista.tipo === "med-cantidad" && (
          <div className="flex flex-wrap gap-1.5 pl-[46px]">
            {CHIPS_CANTIDAD.map((c) => (
              <ChipBoton key={c} texto={c} onClick={() => responderCantidadMeds(c)} />
            ))}
          </div>
        )}

        {!escribiendo && vista.tipo === "med-dosis" && (
          <div className="flex flex-wrap gap-1.5 pl-[46px]">
            <ChipBoton texto="No sé / Saltear" onClick={() => responderChip("med-dosis", "No sé / Saltear")} />
          </div>
        )}

        {!escribiendo && vista.tipo === "med-unidad" && (
          <div className="flex flex-wrap gap-1.5 pl-[46px]">
            {CHIPS_UNIDAD.map((c) => (
              <ChipBoton key={c} texto={c} onClick={() => responderUnidadMed(vista.numero, c)} />
            ))}
          </div>
        )}

        {!escribiendo && vista.tipo === "med-momento" && (
          <div className="flex flex-wrap gap-1.5 pl-[46px]">
            {ORDEN_MOMENTOS.map((m) => (
              <ChipBoton key={m} texto={ETIQUETA_MOMENTO[m]} onClick={() => responderMomentoMed(vista.toma, m)} />
            ))}
          </div>
        )}

        {!escribiendo && vista.tipo === "med-comida" && (
          <div className="flex flex-wrap gap-1.5 pl-[46px]">
            {comidasDelMomento(vista.momento).map((c) => (
              <ChipBoton key={c.clave} texto={c.etiqueta} onClick={() => responderComidaMed(vista.toma, vista.momento, c)} />
            ))}
            <ChipBoton texto="No importa" onClick={() => responderComidaMed(vista.toma, vista.momento, null)} />
          </div>
        )}

        {!escribiendo && vista.tipo === "med-hora" && (
          <div className="flex flex-col gap-2 pl-[46px]">
            <div className="flex flex-wrap gap-1.5">
              <ChipBoton texto={`${vista.sugerida}, está bien`} onClick={() => responderHoraMed(vista, vista.sugerida)} />
              {!vista.otra && <ChipBoton texto="Otra hora" onClick={() => setVista({ ...vista, otra: true })} />}
            </div>
            {vista.otra && <HoraOtra inicial={vista.sugerida} onConfirmar={(h) => responderHoraMed(vista, h)} />}
          </div>
        )}

        {!escribiendo && vista.tipo === "med-confirmar" && (
          <div className="pl-[46px]">
            <TarjetaConfirmarMed borrador={borrador} etiquetaPara={etiquetaPara} onEditar={editarMedicamento} onGuardar={confirmarRemedio} />
          </div>
        )}

        {!escribiendo && vista.tipo === "med-revision" && (
          <div className="pl-[46px]">
            <TarjetaRevisionRemedios
              items={remedios}
              etiquetaPara={etiquetaPara}
              onQuitar={(id) => setRemedios((prev) => quitarItem(prev, id))}
              onAgregarOtro={agregarOtroRemedio}
              onGuardar={() => void guardarTodosRemedios()}
            />
          </div>
        )}

        {!escribiendo && vista.tipo === "handoff-vos" && (
          <div className="flex flex-col gap-3 pl-[46px]">
            <div className="flex gap-2">
              <button type="button" onClick={irAVosAhora} className="h-12 flex-1 rounded-full bg-primary text-[14px] font-extrabold text-primary-foreground shadow-cta">
                Sumarme yo
              </button>
              <button type="button" onClick={irADespues} className="h-12 flex-1 rounded-full border border-teal-line bg-card text-[14px] font-bold text-teal-deep">
                Listo por ahora
              </button>
            </div>
          </div>
        )}

        {!escribiendo && vista.tipo === "multi" && (
          <ChipsMulti
            opciones={vista.paso === "cond" ? OPC_CONDICIONES : OPC_ALERGIAS}
            solas={OPC_SOLAS}
            seleccion={vista.seleccion}
            onToggle={alternarMulti}
            onSola={(o) => responderMulti(vista.paso, [], o)}
            onListo={() => responderMulti(vista.paso, vista.seleccion)}
          />
        )}

        {!escribiendo && vista.tipo === "chips" && (
          <div className="flex flex-wrap gap-1.5 pl-[46px]">
            {OPCIONES_CHIPS[vista.paso].map((o) => (
              <ChipBoton key={o} texto={o} onClick={() => responderChip(vista.paso, o)} />
            ))}
          </div>
        )}

        {!escribiendo && vista.tipo === "turno-fecha" && (
          <div className="pl-[46px]">
            <TarjetaFechaTurno onConfirmar={(fecha, hora) => confirmarFechaTurno(vista.especialidad, fecha, hora)} />
          </div>
        )}

        {!escribiendo && vista.tipo === "turno-lugar" && (
          <div className="pl-[46px]">
            <ChipBoton texto="Lo cargo después" onClick={() => agregarTurnoALista(vista, null)} />
          </div>
        )}

        {!escribiendo && vista.tipo === "turno-revision" && (
          <div className="pl-[46px]">
            <TarjetaRevisionTurnos
              items={turnos}
              etiquetaPara={etiquetaPara}
              onQuitar={(id) => setTurnos((prev) => quitarItem(prev, id))}
              onAgregarOtro={agregarOtroTurno}
              onGuardar={() => void guardarTodosTurnos()}
            />
          </div>
        )}

        {!escribiendo && vista.tipo === "compartir" && (
          <div className="flex flex-col gap-3 pl-[46px]">
            <TarjetaResumenPropia resumen={resumen} titulo={`Perfil de ${nombrePersona ?? "la persona"}`} sub={subPersona(relacionPersona, nacimientoPersona)} color={colorPersona} />
            <div className="flex flex-wrap gap-1.5">
              <ChipBoton texto="Compartir código" onClick={compartirCodigo} />
              <ChipBoton texto="Ahora no" onClick={noCompartirAhora} />
            </div>
          </div>
        )}

        {!escribiendo && vista.tipo === "codigo-seguir" && (
          <div className="flex flex-col gap-3 pl-[46px]">
            <button type="button" onClick={seguirTrasCodigo} className="h-12 rounded-full bg-primary text-[14px] font-extrabold text-primary-foreground shadow-cta">
              Seguir
            </button>
          </div>
        )}

        {!escribiendo && vista.tipo === "resumen-propio" && (
          <div className="flex flex-col gap-3 pl-[46px]">
            <TarjetaResumenPropia resumen={resumen} />
            <button type="button" onClick={() => terminarTodo(<TarjetaResumenPropia resumen={resumen} />)} className="h-12 rounded-full bg-primary text-[15px] font-extrabold text-primary-foreground shadow-cta">
              Continuar
            </button>
          </div>
        )}
      </div>

      <div className="shrink-0 bg-card px-3.5 pb-[30px] pt-2.5">
        <CampoEntrada
          // Remonta al cambiar de paso: limpia el texto escrito y corta cualquier dictado.
          key={placeholderCampo ?? "inerte"}
          activo={placeholderCampo !== null}
          onEnviar={(texto, audioSeg) => enviarDesdeCampo(texto, audioSeg)}
          placeholder={placeholderCampo ?? undefined}
        />
      </div>
    </div>
  );
}

function placeholderDelPaso(vista: Vista): string | null {
  switch (vista.tipo) {
    case "nombre-edad":
      return "Nombre y fecha de nacimiento…";
    case "nacimiento":
      return "Ej: 12/3/1950";
    case "med-cantidad":
      return "Ej: 3, o Losartán y Metformina";
    case "med-nombre":
      return "Ej: Losartán";
    case "med-dosis":
      return "Ej: 50 mg";
    case "turno-spec-texto":
      return "Ej: Dermatólogo";
    case "turno-lugar":
      return "Escribí el lugar";
    default:
      return null;
  }
}

function FormularioNombreManual({
  relacion,
  nombreInicial,
  nacimientoInicial,
  onGuardar,
}: {
  relacion: string;
  nombreInicial: string;
  nacimientoInicial: string;
  onGuardar: (nombre: string, textoNacimiento: string) => void;
}) {
  const [nombre, setNombre] = useState(nombreInicial);
  const [nacimiento, setNacimiento] = useState(nacimientoInicial);

  return (
    <div className="flex flex-col gap-2.5 rounded-[20px] bg-card p-3.5 shadow-card">
      <input
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        placeholder={`Nombre de ${articuloRelacion(relacion)}`}
        aria-label="Nombre"
        className="rounded-[14px] bg-secondary px-3 py-2 text-[13px] font-semibold outline-none"
      />
      <input
        value={nacimiento}
        onChange={(e) => setNacimiento(e.target.value.slice(0, 40))}
        placeholder="Fecha de nacimiento o edad (opcional)"
        aria-label="Fecha de nacimiento o edad"
        className="rounded-[14px] bg-secondary px-3 py-2 text-[13px] outline-none"
      />
      <button
        type="button"
        disabled={!nombre.trim()}
        onClick={() => onGuardar(nombre.trim(), nacimiento.trim())}
        className="rounded-full bg-primary py-2 text-[12.5px] font-bold text-primary-foreground disabled:opacity-50"
      >
        Guardar
      </button>
    </div>
  );
}

function TarjetaConsentimiento({
  nombre,
  autorizado,
  onToggle,
  onConfirmar,
  congelada,
}: {
  nombre: string;
  autorizado: boolean;
  onToggle: (v: boolean) => void;
  onConfirmar: () => void;
  // Ya contestada: queda en el historial tildada y sin botón.
  congelada?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-[20px] bg-card p-4 shadow-card">
      <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Perfil de {nombre}</div>
      <label className="flex items-start gap-2.5">
        <input type="checkbox" checked={autorizado} disabled={congelada} onChange={(e) => onToggle(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-primary" />
        <span className="text-[13.5px] font-semibold leading-snug">Tengo autorización de {nombre} para cargar y gestionar sus datos de salud.</span>
      </label>
      <p className="text-[12px] text-muted-foreground">Solo vos y quien vos invites pueden ver estos datos. Podés borrar el perfil cuando quieras.</p>
      {congelada ? (
        <MarcaCongelada texto="Aceptado" />
      ) : (
        <button
          type="button"
          disabled={!autorizado}
          onClick={onConfirmar}
          className="h-12 rounded-full bg-primary text-[14px] font-bold text-primary-foreground disabled:opacity-50"
        >
          Confirmar
        </button>
      )}
    </div>
  );
}

// Sello de una tarjeta que ya quedó en el historial ("Aceptado", "Guardado").
function MarcaCongelada({ texto }: { texto: string }) {
  return (
    <div className="flex items-center gap-[5px] self-start rounded-full bg-persona-1-tint px-2.5 py-[5px] text-[11.5px] font-extrabold text-teal-deep">
      <VitaIcon name="check" size={12} />
      {texto}
    </div>
  );
}

// Hora exacta distinta de la sugerida: campo nativo controlado + "Listo".
function HoraOtra({ inicial, onConfirmar }: { inicial: string; onConfirmar: (hora: string) => void }) {
  const [hora, setHora] = useState(inicial);

  return (
    <div className="flex items-center gap-2 rounded-[var(--radius-card)] bg-card p-3 shadow-card">
      <input
        type="time"
        value={hora}
        onChange={(e) => setHora(e.target.value)}
        aria-label="Hora de la toma"
        className="flex-1 rounded-[14px] bg-secondary px-3 py-2 text-[13px] font-semibold outline-none"
      />
      <button
        type="button"
        disabled={!hora}
        onClick={() => onConfirmar(hora)}
        className="rounded-full bg-primary px-4 py-2 text-[12.5px] font-bold text-primary-foreground disabled:opacity-50"
      >
        Listo
      </button>
    </div>
  );
}


// Confirmación de UN remedio armado a pura pregunta: "Losartán 50 mg" y una
// línea por toma ("08:00 · Con el desayuno"). Editar vuelve a cargar este remedio.
function TarjetaConfirmarMed({
  borrador,
  etiquetaPara,
  onEditar,
  onGuardar,
  congelada,
}: {
  borrador: BorradorMed;
  etiquetaPara: string;
  onEditar?: () => void;
  onGuardar?: () => void;
  // Ya resuelta: queda en el historial sin botones y con el sello de lo que pasó.
  congelada?: "anotado" | "editado";
}) {
  return (
    <div className="flex flex-col gap-2.5 rounded-[20px] bg-card p-3.5 shadow-card">
      <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Para: {etiquetaPara}</div>
      <div className="break-words font-heading text-[19px] font-extrabold">{tituloMed(borrador)}</div>
      <div className="flex flex-col gap-1.5">
        {borrador.tomas.map((t) => (
          <span key={t.hora} className="rounded-full bg-secondary px-3 py-1.5 text-[12.5px] font-semibold">
            {lineaDeToma(t)}
          </span>
        ))}
      </div>
      {congelada ? (
        <MarcaCongelada texto={congelada === "anotado" ? "Anotado" : "Se vuelve a cargar"} />
      ) : (
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onEditar} className="flex-1 rounded-full bg-secondary py-2 text-[12.5px] font-semibold">
            Editar
          </button>
          <button type="button" onClick={onGuardar} className="flex-1 rounded-full bg-primary py-2 text-[12.5px] font-bold text-primary-foreground">
            Listo
          </button>
        </div>
      )}
    </div>
  );
}

// Los botones chicos de una fila de lista (Quitar).
function BotonQuitar({ onClick, etiqueta }: { onClick: () => void; etiqueta: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Quitar ${etiqueta}`}
      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-card text-subtle shadow-item"
    >
      <VitaIcon name="close" size={14} />
    </button>
  );
}

// Revisión de TODOS los remedios antes de guardar: cada uno es su propia fila,
// se puede quitar uno (los guardados no) o agregar otro. Los que no se pudieron
// guardar quedan acá con su error.
function TarjetaRevisionRemedios({
  items,
  etiquetaPara,
  onQuitar,
  onAgregarOtro,
  onGuardar,
  congelada,
}: {
  items: ItemLista<BorradorMed>[];
  etiquetaPara: string;
  onQuitar?: (id: string) => void;
  onAgregarOtro?: () => void;
  onGuardar?: () => void;
  congelada?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-[20px] bg-card p-3.5 shadow-card">
      <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        Remedios de {etiquetaPara} · {items.length}
      </div>
      {items.length === 0 && <p className="text-[13px] text-subtle">No quedó ningún remedio en la lista.</p>}
      <div className="flex flex-col gap-2">
        {items.map((it) => (
          <div key={it.id} className="flex items-start gap-2 rounded-[var(--radius-item)] bg-secondary p-3">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="break-words font-heading text-[15px] font-extrabold leading-snug">{tituloMed(it.datos)}</div>
              {it.datos.tomas.map((t) => (
                <div key={t.hora} className="break-words text-[12.5px] font-semibold text-slate-brand">
                  {lineaDeToma(t)}
                </div>
              ))}
              {it.error && <div className="break-words text-[12px] font-bold text-destructive">No se pudo guardar: {it.error}</div>}
            </div>
            {!congelada && !it.guardado && onQuitar && <BotonQuitar onClick={() => onQuitar(it.id)} etiqueta={it.datos.nombre} />}
            {it.guardado && <MarcaCongelada texto="Guardado" />}
          </div>
        ))}
      </div>
      {congelada ? (
        <MarcaCongelada texto={items.length > 0 ? "Guardados" : "Sin remedios"} />
      ) : (
        <div className="flex gap-2">
          <button type="button" onClick={onAgregarOtro} className="flex-1 rounded-full bg-secondary py-2.5 text-[12.5px] font-semibold">
            Agregar otro
          </button>
          <button type="button" onClick={onGuardar} className="flex-1 rounded-full bg-primary py-2.5 text-[12.5px] font-bold text-primary-foreground">
            {items.length === 0 ? "Seguir sin remedios" : items.length === 1 ? "Guardar" : "Guardar todo"}
          </button>
        </div>
      )}
    </div>
  );
}

// Lo mismo para los turnos: una fila por turno (ver FilaTurno), nada se pierde en silencio.
function TarjetaRevisionTurnos({
  items,
  etiquetaPara,
  onQuitar,
  onAgregarOtro,
  onGuardar,
  congelada,
}: {
  items: ItemLista<TurnoBorrador>[];
  etiquetaPara: string;
  onQuitar?: (id: string) => void;
  onAgregarOtro?: () => void;
  onGuardar?: () => void;
  congelada?: boolean;
}) {
  const anioActual = Number(fechaISOEnAR().slice(0, 4));
  return (
    <div className="flex flex-col gap-3 rounded-[20px] bg-card p-3.5 shadow-card">
      <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        Turnos de {etiquetaPara} · {items.length}
      </div>
      {items.length === 0 && <p className="text-[13px] text-subtle">No quedó ningún turno en la lista.</p>}
      <div className="flex flex-col gap-2">
        {items.map((it) => (
          <div key={it.id} className="flex flex-col gap-1">
            <FilaTurno
              turno={it.datos}
              anioActual={anioActual}
              accion={
                it.guardado ? (
                  <MarcaCongelada texto="Guardado" />
                ) : !congelada && onQuitar ? (
                  <BotonQuitar onClick={() => onQuitar(it.id)} etiqueta={it.datos.especialidad} />
                ) : undefined
              }
            />
            {it.error && <div className="break-words px-1 text-[12px] font-bold text-destructive">No se pudo guardar: {it.error}</div>}
          </div>
        ))}
      </div>
      {congelada ? (
        <MarcaCongelada texto={items.length > 0 ? "Guardados" : "Sin turnos"} />
      ) : (
        <div className="flex gap-2">
          <button type="button" onClick={onAgregarOtro} className="flex-1 rounded-full bg-secondary py-2.5 text-[12.5px] font-semibold">
            Agregar otro
          </button>
          <button type="button" onClick={onGuardar} className="flex-1 rounded-full bg-primary py-2.5 text-[12.5px] font-bold text-primary-foreground">
            {items.length === 0 ? "Seguir sin turnos" : items.length === 1 ? "Guardar" : "Guardar todo"}
          </button>
        </div>
      )}
    </div>
  );
}

function TarjetaFechaTurno({ onConfirmar }: { onConfirmar: (fecha: string, hora: string) => void }) {
  const [fecha, setFecha] = useState("");
  const [hora, setHora] = useState("09:00");

  return (
    <div className="flex flex-col gap-2.5 rounded-[var(--radius-card)] bg-card p-3.5 shadow-card">
      <input
        type="date"
        value={fecha}
        min={fechaISOEnAR()}
        onChange={(e) => setFecha(e.target.value)}
        aria-label="Día del turno"
        className="rounded-[14px] bg-secondary px-3 py-2 text-[13px] font-semibold outline-none"
      />
      <input
        type="time"
        value={hora}
        onChange={(e) => setHora(e.target.value)}
        aria-label="Hora del turno"
        className="rounded-[14px] bg-secondary px-3 py-2 text-[13px] font-semibold outline-none"
      />
      <button
        type="button"
        disabled={!fecha || !hora}
        onClick={() => onConfirmar(fecha, hora)}
        className="rounded-full bg-primary py-2 text-[12.5px] font-bold text-primary-foreground disabled:opacity-50"
      >
        Seguir
      </button>
    </div>
  );
}

function subPersona(relacion: string | null, nacimiento: Nacimiento | null): string {
  const edad = edadDeNacimiento(nacimiento);
  return [relacion, edad !== null ? `${edad} años` : null].filter(Boolean).join(" · ");
}

// Tarjeta de resumen (V7 `who === 'c'`): lo que quedó cargado, "Sin cargar"
// en lo que se salteó. Sin `color` es la propia ("Tu perfil"); con `color`,
// la de la persona a cargo. Los remedios y los turnos se apilan debajo de su
// título (uno por bloque), no en una columna angosta a la derecha: con varios
// se leen enteros y envuelven.
export function TarjetaResumenPropia({
  resumen,
  titulo = "Tu perfil",
  sub = "Vos",
  color,
}: {
  resumen: ResumenPropio;
  titulo?: string;
  sub?: string;
  color?: ColorPerfil;
}) {
  const filas: [string, string[]][] = [
    ["Condición", resumen.cond.length ? [resumen.cond.join(", ")] : []],
    ["Alergia", resumen.alergias.length ? [resumen.alergias.join(", ")] : []],
    ["Mediciones", resumen.meas ? [resumen.meas] : []],
  ];
  const clases = color ? CLASES_COLOR[color] : null;
  const inicial = titulo.replace(/^Perfil de /, "").trim().charAt(0).toUpperCase() || "V";
  const anioActual = Number(fechaISOEnAR().slice(0, 4));

  return (
    <div className="flex flex-col gap-3 rounded-[20px] bg-card p-[15px] shadow-card">
      <div className="flex items-center gap-[11px]">
        <div
          className={cn(
            "flex size-[42px] shrink-0 items-center justify-center rounded-full font-heading text-base font-extrabold",
            clases ? cn(clases.solido, "text-primary-foreground") : "bg-ink text-background"
          )}
        >
          {clases ? inicial : "V"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="break-words font-heading text-[15.5px] font-extrabold tracking-[-0.01em]">{titulo}</div>
          <div className="text-xs font-medium text-subtle">{sub}</div>
        </div>
        <div className={cn("flex shrink-0 items-center gap-[5px] rounded-full px-2.5 py-[5px] text-[11.5px] font-extrabold", clases ? cn(clases.fondo, clases.tinta) : "bg-persona-1-tint text-teal-deep")}>
          <VitaIcon name="check" size={12} />
          Perfil creado
        </div>
      </div>
      <div className="flex flex-col border-t border-line-soft">
        {filas.slice(0, 2).map(([k, v]) => (
          <FilaResumen key={k} etiqueta={k} lineas={v} />
        ))}
        <RemediosResumen meds={resumen.meds} />
        {resumen.turnos.length === 0 ? (
          <FilaResumen etiqueta="Turnos" lineas={[]} />
        ) : (
          <div className="flex flex-col gap-2 border-b border-line-soft py-[9px]">
            <span className="text-[13px] font-semibold text-slate-brand">Turnos · {resumen.turnos.length}</span>
            {resumen.turnos.map((t, i) => (
              <FilaTurno key={`${t.fecha}-${t.hora}-${i}`} turno={t} anioActual={anioActual} />
            ))}
          </div>
        )}
        {filas.slice(2).map(([k, v]) => (
          <FilaResumen key={k} etiqueta={k} lineas={v} />
        ))}
      </div>
    </div>
  );
}

// Una línea por remedio: nombre a la izquierda y horas a la derecha. Con muchos
// se muestran los primeros y el resto se abre, para que la tarjeta se pueda leer.
function RemediosResumen({ meds }: { meds: RemedioResumen[] }) {
  const [abierto, setAbierto] = useState(false);
  if (meds.length === 0) return <FilaResumen etiqueta="Remedios" lineas={[]} />;
  const { visibles, ocultos } = remediosVisibles(meds, abierto);
  return (
    <div className="flex flex-col border-b border-line-soft py-[9px]">
      <span className="text-[13px] font-semibold text-slate-brand">Remedios · {meds.length}</span>
      <ul className="mt-1 flex flex-col">
        {visibles.map((m, i) => (
          <li key={`${m.titulo}-${i}`} className="flex items-baseline justify-between gap-3 border-t border-line-soft py-[7px] first:border-t-0">
            <span className="min-w-0 break-words text-[13.5px] font-bold">{m.titulo}</span>
            <span className="shrink-0 text-right text-[12.5px] font-semibold tabular-nums text-slate-brand">{horasDeRemedio(m.tomas)}</span>
          </li>
        ))}
      </ul>
      {ocultos > 0 && (
        <button type="button" onClick={() => setAbierto(true)} className="mt-1 self-start py-1 text-[13px] font-bold text-teal-deep">
          Ver {ocultos} más
        </button>
      )}
    </div>
  );
}

function FilaResumen({ etiqueta, lineas }: { etiqueta: string; lineas: string[] }) {
  return (
    <div className="flex justify-between gap-3 border-b border-line-soft py-[9px]">
      <span className="shrink-0 text-[13px] font-semibold text-slate-brand">{etiqueta}</span>
      <span className={cn("flex min-w-0 flex-col break-words text-right text-[13px] font-bold", lineas.length ? "text-foreground" : "text-subtle")}>
        {lineas.length ? lineas.map((linea, i) => <span key={i}>{linea}</span>) : "Sin cargar"}
      </span>
    </div>
  );
}
