"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { MedicionesEnCasa, UsoApp } from "@/lib/perfil/tipos";
import { CLASES_COLOR } from "@/lib/familia/colores";
import type { ColorPerfil } from "@/lib/familia/tipos";
import { generarCodigoAccesoAction } from "@/app/cuidar/[elderId]/actions";
import { cantidadDeTomas, FRECUENCIAS_MEDICAMENTO } from "@/lib/medicamentos/comidas";
import type { ConComida, MomentoDia } from "@/lib/medicamentos/tipos";
import { ETIQUETA_MOMENTO, normalizarHora, ORDEN_MOMENTOS } from "@/lib/rutina/momento";
import { VitaIcon } from "@/lib/vita-icons";
import { Burbuja, CampoEntrada, ChipBoton, ChipsMulti, EncabezadoConversar, PuntosEscribiendo, TarjetaCodigoCompartir, type Mensaje } from "./componentes";
import {
  crearPerfilFamiliarAction,
  extraerNombreEdadAction,
  finalizarOnboardingAction,
  guardarAlergiasPropiasAction,
  guardarCondicionesPropiasAction,
  guardarMedicamentoPropioAction,
  guardarMedicionesEnCasaAction,
  guardarTurnoPropioAction,
  marcarUsoAmbosAction,
} from "./actions";
import {
  BORRADOR_VACIO,
  CHIPS_UNIDAD,
  comidasDelMomento,
  etiquetaDeToma,
  horaSugeridaSinComida,
  leerDosis,
  lineaDeToma,
  tituloMed,
  UNIDAD_POR_CHIP,
  type BorradorMed,
} from "./medicamento-guiado";

// Onboarding conversacional nuevo (reemplaza /onboarding/nombre +
// /onboarding/chat como camino por defecto — ver pantallas/ingreso /Ingreso1-3.jpeg,
// la referencia visual/de flujo). El guion viejo (sin IA, por catálogo)
// sigue existiendo, alcanzable desde "Prefiero un formulario" en el header.
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

type PasoChips = "med" | "med-dosis" | "med-frecuencia" | "med-otro" | "turno" | "turno-spec" | "meas";
const OPCIONES_CHIPS: Record<PasoChips, readonly string[]> = {
  med: ["Sí", "No", "Saltear"],
  "med-dosis": ["No sé / Saltear"],
  "med-frecuencia": FRECUENCIAS_MEDICAMENTO,
  "med-otro": ["Sí", "No"],
  turno: ["Sí", "No", "Saltear"],
  "turno-spec": ESPECIALIDADES,
  meas: ["Presión", "Azúcar", "Las dos", "No", "Saltear"],
};

// `meds`: un renglón por toma guardada ("Losartán 50 mg · 08:00 · Con el desayuno").
type ResumenPropio = { cond: string[]; alergias: string[]; meds: string[]; turno: string | null; meas: string | null };
const RESUMEN_VACIO: ResumenPropio = { cond: [], alergias: [], meds: [], turno: null, meas: null };

// Chip de mediciones -> valor de perfiles.mediciones_en_casa ("Saltear" no guarda nada).
const MEDICIONES_POR_CHIP: Record<string, MedicionesEnCasa | undefined> = {
  Presión: "presion",
  Azúcar: "glucemia",
  "Las dos": "ambas",
  No: "ninguna",
};

const RELACIONES = ["Mamá", "Papá", "Hijo/a", "Pareja", "Abuelo/a", "Otro"] as const;
const ETIQUETA_COLOR: Record<ColorPerfil, string> = { teal: "verde agua", violeta: "violeta", ambar: "ámbar", rosa: "rosa", azul: "azul" };

// Pasada esta edad vita pregunta si no fue un error de tipeo; pasada la máxima
// (la misma que valida el servidor) ni ofrece confirmarla, pide corregirla.
const EDAD_SOSPECHOSA = 120;
const EDAD_MAXIMA = 130;

function articuloRelacion(relacion: string): string {
  if (relacion === "Mamá") return "tu mamá";
  if (relacion === "Papá") return "tu papá";
  if (relacion === "Hijo/a") return "tu hijo o hija";
  if (relacion === "Pareja") return "tu pareja";
  if (relacion === "Abuelo/a") return "tu abuela o abuelo";
  return "esa persona";
}

type Vista =
  | { tipo: "relacion" }
  | { tipo: "nombre-edad"; relacion: string }
  | { tipo: "nombre-edad-manual"; relacion: string; nombreSugerido: string }
  | { tipo: "edad-confirmar"; relacion: string; nombre: string; edad: number }
  | { tipo: "edad-corregir"; relacion: string; nombre: string }
  | { tipo: "consentimiento"; nombre: string; autorizado: boolean }
  // Remedios, una pregunta por vez. `toma` es el índice de la toma que se está definiendo.
  | { tipo: "med-nombre" }
  | { tipo: "med-dosis" }
  | { tipo: "med-unidad"; numero: string }
  | { tipo: "med-momento"; toma: number }
  | { tipo: "med-comida"; toma: number; momento: MomentoDia }
  | { tipo: "med-hora"; toma: number; sugerida: string; conComida: ConComida; etiqueta: string | null; otra: boolean }
  | { tipo: "med-confirmar" }
  | { tipo: "handoff-vos" }
  | { tipo: "multi"; paso: "cond" | "alergia"; seleccion: string[] }
  | { tipo: "chips"; paso: PasoChips }
  | { tipo: "turno-spec-texto" }
  | { tipo: "turno-fecha"; especialidad: string }
  | { tipo: "turno-lugar"; especialidad: string; fecha: string; hora: string }
  | { tipo: "resumen-propio" }
  | { tipo: "compartir" }
  // El código ya quedó en el historial; solo falta el botón para seguir.
  | { tipo: "codigo-seguir" }
  // Transición en curso (sin controles): evita tocar algo de un paso ya contestado.
  | { tipo: "espera" }
  | { tipo: "fin" };

function mensajesIniciales(usoApp: UsoApp): Mensaje[] {
  if (usoApp === "yo") {
    return [
      { id: "vita-0", from: "vita", texto: "¡Hola! Soy vita." },
      { id: "vita-1", from: "vita", texto: "Te hago unas preguntas cortas para armar tu perfil. Podés saltear cualquiera." },
      { id: "vita-2", from: "vita", texto: "¿Tenés alguna condición de salud? Podés marcar varias." },
    ];
  }
  return [{ id: "vita-0", from: "vita", texto: "¡Hola! Soy vita. Empecemos por la persona que cuidás. ¿Quién es?" }];
}

export function ConversarOnboarding({ usoApp }: { usoApp: UsoApp }) {
  const dosTabs = usoApp !== "yo";

  const [mensajes, setMensajes] = useState<Mensaje[]>(() => mensajesIniciales(usoApp));
  const [escribiendo, setEscribiendo] = useState(false);
  const [vista, setVista] = useState<Vista>(
    dosTabs ? { tipo: "relacion" } : { tipo: "multi", paso: "cond", seleccion: [] }
  );
  const [resumen, setResumen] = useState<ResumenPropio>(RESUMEN_VACIO);
  const [hayAvance, setHayAvance] = useState(false);
  const [tabActiva, setTabActiva] = useState<"persona" | "vos">("persona");
  const [personaCompleta, setPersonaCompleta] = useState(false);
  const [nombrePersona, setNombrePersona] = useState<string | null>(null);
  const [edadPersona, setEdadPersona] = useState<number | null>(null);
  const [relacionPersona, setRelacionPersona] = useState<string | null>(null);
  const [colorPersona, setColorPersona] = useState<ColorPerfil>("violeta");
  const [personaId, setPersonaId] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(1);
  const [borrador, setBorrador] = useState<BorradorMed>(BORRADOR_VACIO);
  // El aviso de "contar pastillas por foto" se dice una sola vez por recorrido.
  const avisoPastillasDicho = useRef(false);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [mensajes, escribiendo]);

  // Sobre quién se está preguntando: la persona a cargo (tab 1) o uno mismo
  // (tab 2, o el recorrido "yo"). `quien` es el nombre para hablar en tercera
  // persona; null = segunda persona ("vos").
  const esPersona = dosTabs && tabActiva === "persona";
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

  // ---- Paso "relación" ----------------------------------------------------

  function elegirRelacion(relacion: string) {
    agregarBurbujaUsuario(relacion);
    agregarBurbujaVita(`¿Cómo se llama ${articuloRelacion(relacion)} y cuántos años tiene?`);
    setVista({ tipo: "nombre-edad", relacion });
  }

  // ---- Paso "nombre + edad" -------------------------------------------------

  async function responderNombreEdad(relacion: string, texto: string, audioSeg?: number) {
    agregarBurbujaUsuario(texto, audioSeg);
    setEscribiendo(true);

    const resultado = await extraerNombreEdadAction(texto, relacion);
    setEscribiendo(false);

    if (resultado.status === "error") {
      agregarBurbujaVita("No llegué a entender bien el nombre — ¿me lo escribís tal cual, por las dudas?");
      setVista({ tipo: "nombre-edad-manual", relacion, nombreSugerido: "" });
      return;
    }

    await validarEdadYSeguir(relacion, resultado.nombre, resultado.edad);
  }

  // La edad se confirma antes de crear nada: un número negativo o disparatado casi
  // siempre es un error de tipeo o de dictado.
  async function validarEdadYSeguir(relacion: string, nombre: string, edad: number | null) {
    if (edad !== null && (!Number.isFinite(edad) || edad < 0 || edad > EDAD_MAXIMA)) {
      agregarBurbujaVita(`No entendí bien la edad de ${nombre}. ¿Cuántos años tiene?`);
      setVista({ tipo: "edad-corregir", relacion, nombre });
      return;
    }
    if (edad !== null && edad > EDAD_SOSPECHOSA) {
      agregarBurbujaVita(`¿${nombre} tiene ${edad} años? Me parece mucho, ¿lo pusiste bien?`);
      setVista({ tipo: "edad-confirmar", relacion, nombre, edad });
      return;
    }
    await crearPerfilYSeguir(relacion, nombre, edad);
  }

  // Crear el perfil abre una cuenta real: un doble toque no puede crear dos.
  const creandoPerfil = useRef(false);

  async function crearPerfilYSeguir(relacion: string, nombre: string, edad: number | null) {
    if (creandoPerfil.current) return;
    creandoPerfil.current = true;
    setEscribiendo(true);
    const creado = await crearPerfilFamiliarAction({ nombre, relacion, edad }).catch(
      () => ({ status: "error", message: "revisá tu conexión e intentá de nuevo" }) as const
    );
    setEscribiendo(false);
    creandoPerfil.current = false;

    if (creado.status === "error") {
      toast.error(`No pudimos crear el perfil: ${creado.message}`);
      setVista({ tipo: "nombre-edad-manual", relacion, nombreSugerido: nombre });
      return;
    }

    agregarBurbujaVita(
      `Perfecto, voy a crear el perfil de ${nombre}. Le asigno el color ${ETIQUETA_COLOR[creado.color]} para que siempre sepas cuándo estás viendo lo suyo.`
    );
    setHayAvance(true);
    setNombrePersona(nombre);
    setEdadPersona(edad);
    setRelacionPersona(relacion);
    setColorPersona(creado.color);
    setPersonaId(creado.id);

    window.setTimeout(() => {
      agregarBurbujaVita("Antes de seguir, necesito que me confirmes una cosa. Son datos de salud, así que los cuidamos mucho.");
      setVista({ tipo: "consentimiento", nombre, autorizado: false });
    }, 450);
  }

  function confirmarConsentimiento(nombre: string) {
    agregarTarjeta(<TarjetaConsentimiento nombre={nombre} autorizado onToggle={() => {}} onConfirmar={() => {}} congelada />);
    decir(`¿${nombre} tiene alguna condición de salud? Podés marcar varias.`);
    setVista({ tipo: "multi", paso: "cond", seleccion: [] });
  }

  // ---- Medicamentos (persona o "vos"): charla guiada, una pregunta por vez ----
  // nombre -> dosis (-> unidad si vino un número pelado) -> veces por día ->
  // por cada toma: momento -> comida -> hora -> tarjeta de confirmación.

  function empezarMedicamento() {
    setBorrador(BORRADOR_VACIO);
    decir(q((n) => `¿Cómo se llama el remedio de ${n}?`, "¿Cómo se llama el remedio?"));
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
    agregarBurbujaUsuario(frecuencia);
    setBorrador((b) => ({ ...b, frecuencia, tomas: [] }));
    preguntarMomentoToma(0, cantidadDeTomas(frecuencia));
  }

  function responderMomentoMed(toma: number, momento: MomentoDia) {
    agregarBurbujaUsuario(ETIQUETA_MOMENTO[momento]);
    decir("¿Con qué comida?");
    setVista({ tipo: "med-comida", toma, momento });
  }

  function responderComidaMed(toma: number, momento: MomentoDia, comida: { etiqueta: string; hora: string; conComida: ConComida } | null) {
    agregarBurbujaUsuario(comida?.etiqueta ?? "No importa");
    const sugerida = comida?.hora ?? horaSugeridaSinComida(momento);
    decir("¿A qué hora exactamente?");
    setVista({ tipo: "med-hora", toma, sugerida, conComida: comida?.conComida ?? "no-importa", etiqueta: comida?.etiqueta ?? null, otra: false });
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
    const tomas = [...borrador.tomas.slice(0, v.toma), { hora: normal, conComida: v.conComida, etiqueta: v.etiqueta }];
    setBorrador((b) => ({ ...b, tomas }));

    const total = cantidadDeTomas(borrador.frecuencia);
    if (tomas.length < total) {
      preguntarMomentoToma(tomas.length, total);
      return;
    }
    if (!avisoPastillasDicho.current) {
      avisoPastillasDicho.current = true;
      decir("Si querés llevar la cuenta de cuántas pastillas quedan, después lo podés hacer desde Mis pastillas: le sacás una foto al blíster y las cuento yo.");
    }
    decir("Revisá que esté bien:");
    setVista({ tipo: "med-confirmar" });
  }

  function editarMedicamento() {
    agregarTarjeta(<TarjetaConfirmarMed borrador={borrador} etiquetaPara={esPersona ? nombrePersona ?? "la persona que cuidás" : "vos"} congelada="editado" />);
    agregarBurbujaUsuario("Editar");
    decir("Dale, lo cargamos de nuevo.");
    empezarMedicamento();
  }

  // Un doble toque en "Guardar" no puede crear el remedio dos veces.
  const guardandoMed = useRef(false);

  async function guardarMedicamento() {
    if (guardandoMed.current) return;
    if (esPersona && !personaId) {
      toast.error("No encontramos el perfil de la persona. Recargá la página.");
      return;
    }
    guardandoMed.current = true;
    setEscribiendo(true);
    const resultado = await guardarMedicamentoPropioAction(
      {
        nombre: borrador.nombre,
        dosis: borrador.dosis,
        unidad: borrador.unidad,
        frecuencia: borrador.frecuencia || null,
        tomas: borrador.tomas.map((t) => ({ hora: t.hora, conComida: t.conComida })),
      },
      esPersona ? (personaId as string) : undefined
    ).catch(() => ({ status: "error", message: "revisá tu conexión e intentá de nuevo" }) as const);
    setEscribiendo(false);
    guardandoMed.current = false;

    if (resultado.status === "error") {
      toast.error(`No se pudo guardar ${borrador.nombre}: ${resultado.message}`);
      return;
    }
    agregarTarjeta(<TarjetaConfirmarMed borrador={borrador} etiquetaPara={esPersona ? nombrePersona ?? "la persona que cuidás" : "vos"} congelada="guardado" />);
    agregarBurbujaUsuario("Guardar");
    setHayAvance(true);
    setResumen((r) => ({
      ...r,
      meds: [...r.meds, ...borrador.tomas.map((t) => [tituloMed(borrador), lineaDeToma(t)].join(" · "))],
    }));
    decir(q((n) => `Anotado. ¿${n} toma algún otro remedio?`, "Anotado. ¿Tomás algún otro remedio?"));
    setVista({ tipo: "chips", paso: "med-otro" });
  }

  async function irAVosAhora() {
    agregarBurbujaUsuario("Sumarme yo");
    setTabActiva("vos");
    // uso_app pasa a "ambos". Si falla no se corta el chat: "cuido" y
    // "ambos" llevan al mismo destino (vincular-cuidado).
    const r = await marcarUsoAmbosAction();
    if (r.status === "error") toast.error("No pudimos actualizar tu perfil de uso, seguimos igual.");
    setResumen(RESUMEN_VACIO);
    decir("¡Genial! Ahora vos.", "¿Tenés alguna condición de salud? Podés marcar varias.");
    setVista({ tipo: "multi", paso: "cond", seleccion: [] });
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
    return <TarjetaResumenPropia resumen={resumen} titulo={`Perfil de ${nombrePersona ?? "la persona"}`} sub={subPersona(relacionPersona, edadPersona)} color={colorPersona} />;
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

  // ---- Salud propia: condiciones -> alergias -> remedios -> turno -> mediciones

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
    if (paso === "cond") {
      decir(
        sola ? "Perfecto, seguimos." : soloOtra ? "Anotado, después la completás en el perfil." : `Anotado: ${lista}. Lo voy a tener en cuenta en los controles.`,
        q((n) => `¿${n} tiene alguna alergia? Podés marcar varias.`, "¿Alguna alergia? Podés marcar varias.")
      );
      setVista({ tipo: "multi", paso: "alergia", seleccion: [] });
    } else {
      decir(
        sola ? "Buenísimo." : soloOtra ? "Anotado, después la completás en el perfil." : `Anotado: ${lista}. Te aviso si algo choca con eso.`,
        q((n) => `¿${n} toma algún remedio todos los días?`, "¿Tomás algún remedio todos los días?")
      );
      setVista({ tipo: "chips", paso: "med" });
    }
  }

  function preguntarTurno(previo: string) {
    decir(previo, q((n) => `¿${n} tiene algún turno médico próximo?`, "¿Tenés algún turno médico próximo?"));
    setVista({ tipo: "chips", paso: "turno" });
  }

  function preguntarMediciones(previo: string) {
    decir(previo, q((n) => `¿${n} se mide la presión o el azúcar en casa?`, "¿Te medís la presión o el azúcar en casa?"));
    setVista({ tipo: "chips", paso: "meas" });
  }

  function responderChip(paso: PasoChips, valor: string) {
    agregarBurbujaUsuario(valor);
    const omitido = valor === "Saltear" || valor === "No";

    switch (paso) {
      case "med":
        if (valor === "Sí") empezarMedicamento();
        else preguntarTurno(valor === "Saltear" ? "Perfecto." : "Buenísimo.");
        break;
      case "med-dosis":
        // "No sé / Saltear": el remedio queda sin dosis.
        setBorrador((b) => ({ ...b, dosis: null, unidad: "mg" }));
        preguntarFrecuencia();
        break;
      case "med-frecuencia":
        responderFrecuenciaMed(valor);
        break;
      case "med-otro":
        if (valor === "Sí") empezarMedicamento();
        else terminarMedicamentos();
        break;
      case "turno":
        if (valor === "Sí") {
          decir("¿Con qué médico?");
          setVista({ tipo: "chips", paso: "turno-spec" });
        } else {
          preguntarMediciones(valor === "Saltear" ? "Perfecto." : "Buenísimo.");
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
        decir(omitido ? "Dale." : "Perfecto, cuando quieras anotar una medición, hablame y la guardo.");
        setResumen((prev) => ({ ...prev, meas: omitido ? null : valor === "Las dos" ? "Presión · Azúcar" : valor }));
        mostrarResumenPropio();
        break;
      }
    }
  }

  function pedirFechaTurno(especialidad: string) {
    decir("¿Cuándo es? Elegí el día y la hora.");
    setVista({ tipo: "turno-fecha", especialidad });
  }

  function responderEspecialidad(texto: string) {
    agregarBurbujaUsuario(texto);
    pedirFechaTurno(texto);
  }

  function confirmarFechaTurno(especialidad: string, fecha: string, hora: string) {
    agregarBurbujaUsuario(`${fecha.split("-").reverse().join("/")} · ${hora}`);
    decir("¿Dónde es? Escribí el lugar o la dirección.");
    setVista({ tipo: "turno-lugar", especialidad, fecha, hora });
  }

  async function guardarTurno(v: { especialidad: string; fecha: string; hora: string }, lugar: string | null) {
    agregarBurbujaUsuario(lugar ?? "Lo cargo después");
    setEscribiendo(true);
    if (esPersona && !personaId) {
      setEscribiendo(false);
      toast.error("No encontramos el perfil de la persona. Recargá la página.");
      return;
    }
    const r = await guardarTurnoPropioAction({ ...v, lugar }, esPersona ? personaId ?? undefined : undefined);
    setEscribiendo(false);

    if (r.status === "error") {
      toast.error(`No se pudo guardar el turno: ${r.message}`);
      preguntarMediciones("No pude guardar el turno, lo podés cargar después desde Turnos.");
      return;
    }
    setHayAvance(true);
    const cuando = `${v.fecha.split("-").reverse().join("/")} · ${v.hora}`;
    setResumen((prev) => ({ ...prev, turno: [v.especialidad, cuando, lugar].filter(Boolean).join(" · ") }));
    preguntarMediciones("Anotado. Te aviso el día antes y esa mañana.");
  }

  function mostrarResumenPropio() {
    if (quien) {
      decir(
        `¡Listo, el perfil de ${quien} está creado! ¿Querés compartirle un código a ${quien}? Así ve sus remedios y turnos desde su celu, y vos te enterás si los toma.`
      );
      setVista({ tipo: "compartir" });
      return;
    }
    decir("¡Listo, tu perfil está creado! Todo lo demás lo podés completar cuando quieras.");
    setVista({ tipo: "resumen-propio" });
  }

  function terminarMedicamentos() {
    preguntarTurno("Listo con los remedios.");
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
    if (vista.tipo === "nombre-edad") responderNombreEdad(vista.relacion, texto, audioSeg);
    else if (vista.tipo === "med-nombre") responderNombreMed(texto, audioSeg);
    else if (vista.tipo === "med-dosis") responderDosisMed(texto, audioSeg);
    else if (vista.tipo === "turno-spec-texto") responderEspecialidad(texto);
    else if (vista.tipo === "turno-lugar") guardarTurno(vista, texto);
  }

  return (
    <div className="mx-auto flex h-dvh w-full max-w-md flex-col bg-canvas">
      {/* /onboarding/nombre, no /onboarding/chat directo -- conserva el paso
          de nombre del guion viejo en vez de saltarlo (el perfil ya viene
          con el nombre de Google, pero así la persona lo puede corregir
          antes de seguir, como en el flujo original). */}
      <EncabezadoConversar
        tabs={tabs}
        linkFormulario="/onboarding/nombre"
        escribiendo={escribiendo}
        onTerminar={hayAvance && vista.tipo !== "fin" ? terminarDespues : undefined}
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
            <FormularioNombreEdadManual
              relacion={vista.relacion}
              nombreInicial={vista.nombreSugerido}
              onGuardar={(nombre, edad) => validarEdadYSeguir(vista.relacion, nombre, edad)}
            />
          </div>
        )}

        {!escribiendo && vista.tipo === "edad-confirmar" && (
          <div className="flex flex-wrap gap-1.5 pl-[46px]">
            <ChipBoton
              texto="Sí, es correcto"
              onClick={() => {
                agregarBurbujaUsuario("Sí, es correcto");
                void crearPerfilYSeguir(vista.relacion, vista.nombre, vista.edad);
              }}
            />
            <ChipBoton
              texto="Corregir edad"
              onClick={() => {
                agregarBurbujaUsuario("Corregir edad");
                agregarBurbujaVita(`¿Cuántos años tiene ${vista.nombre}?`);
                setVista({ tipo: "edad-corregir", relacion: vista.relacion, nombre: vista.nombre });
              }}
            />
          </div>
        )}

        {!escribiendo && vista.tipo === "edad-corregir" && (
          <div className="pl-[46px]">
            <FormularioEdad onGuardar={(edad) => validarEdadYSeguir(vista.relacion, vista.nombre, edad)} />
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
              <ChipBoton key={c.etiqueta} texto={c.etiqueta} onClick={() => responderComidaMed(vista.toma, vista.momento, c)} />
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
            <TarjetaConfirmarMed
              borrador={borrador}
              etiquetaPara={esPersona ? nombrePersona ?? "la persona que cuidás" : "vos"}
              onEditar={editarMedicamento}
              onGuardar={guardarMedicamento}
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
            <ChipBoton texto="Lo cargo después" onClick={() => guardarTurno(vista, null)} />
          </div>
        )}

        {!escribiendo && vista.tipo === "compartir" && (
          <div className="flex flex-col gap-3 pl-[46px]">
            <TarjetaResumenPropia resumen={resumen} titulo={`Perfil de ${nombrePersona ?? "la persona"}`} sub={subPersona(relacionPersona, edadPersona)} color={colorPersona} />
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
      return "Nombre y edad…";
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

function FormularioNombreEdadManual({
  relacion,
  nombreInicial,
  onGuardar,
}: {
  relacion: string;
  nombreInicial: string;
  onGuardar: (nombre: string, edad: number | null) => void;
}) {
  const [nombre, setNombre] = useState(nombreInicial);
  const [edad, setEdad] = useState("");

  return (
    <div className="flex flex-col gap-2.5 rounded-[20px] bg-card p-3.5 shadow-card">
      <input
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        placeholder={`Nombre de ${articuloRelacion(relacion)}`}
        className="rounded-[14px] bg-secondary px-3 py-2 text-[13px] font-semibold outline-none"
      />
      <input
        value={edad}
        onChange={(e) => setEdad(e.target.value.replace(/\D/g, "").slice(0, 3))}
        inputMode="numeric"
        placeholder="Edad (opcional)"
        className="rounded-[14px] bg-secondary px-3 py-2 text-[13px] outline-none"
      />
      <button
        type="button"
        disabled={!nombre.trim()}
        onClick={() => onGuardar(nombre.trim(), edad ? Number(edad) : null)}
        className="rounded-full bg-primary py-2 text-[12.5px] font-bold text-primary-foreground disabled:opacity-50"
      >
        Guardar
      </button>
    </div>
  );
}

function FormularioEdad({ onGuardar }: { onGuardar: (edad: number) => void }) {
  const [edad, setEdad] = useState("");

  return (
    <div className="flex flex-col gap-2.5 rounded-[20px] bg-card p-3.5 shadow-card">
      <input
        value={edad}
        onChange={(e) => setEdad(e.target.value.replace(/\D/g, "").slice(0, 3))}
        inputMode="numeric"
        placeholder="Edad"
        aria-label="Edad"
        className="rounded-[14px] bg-secondary px-3 py-2 text-[13px] outline-none"
      />
      <button
        type="button"
        disabled={!edad}
        onClick={() => onGuardar(Number(edad))}
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

// Confirmación del remedio armado a pura pregunta: "Losartán 50 mg" y una
// línea por toma ("08:00 · Con el desayuno"). Editar vuelve a empezar este remedio.
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
  congelada?: "guardado" | "editado";
}) {
  return (
    <div className="flex flex-col gap-2.5 rounded-[20px] bg-card p-3.5 shadow-card">
      <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Para: {etiquetaPara}</div>
      <div className="font-heading text-[19px] font-extrabold">{tituloMed(borrador)}</div>
      <div className="flex flex-col gap-1.5">
        {borrador.tomas.map((t) => (
          <span key={t.hora} className="rounded-full bg-secondary px-3 py-1.5 text-[12.5px] font-semibold">
            {lineaDeToma(t)}
          </span>
        ))}
      </div>
      {congelada ? (
        <MarcaCongelada texto={congelada === "guardado" ? "Guardado" : "Se vuelve a cargar"} />
      ) : (
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onEditar} className="flex-1 rounded-full bg-secondary py-2 text-[12.5px] font-semibold">
            Editar
          </button>
          <button type="button" onClick={onGuardar} className="flex-1 rounded-full bg-primary py-2 text-[12.5px] font-bold text-primary-foreground">
            Guardar
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

function subPersona(relacion: string | null, edad: number | null): string {
  return [relacion, edad !== null ? `${edad} años` : null].filter(Boolean).join(" · ");
}

// Tarjeta de resumen (V7 `who === 'c'`): lo que quedó cargado, "Sin cargar"
// en lo que se salteó. Sin `color` es la propia ("Tu perfil"); con `color`,
// la de la persona a cargo.
function TarjetaResumenPropia({
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
    ["Remedio", resumen.meds],
    ["Turno", resumen.turno ? [resumen.turno] : []],
    ["Mediciones", resumen.meas ? [resumen.meas] : []],
  ];
  const clases = color ? CLASES_COLOR[color] : null;
  const inicial = titulo.replace(/^Perfil de /, "").trim().charAt(0).toUpperCase() || "V";

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
          <div className="font-heading text-[15.5px] font-extrabold tracking-[-0.01em]">{titulo}</div>
          <div className="text-xs font-medium text-subtle">{sub}</div>
        </div>
        <div className={cn("flex items-center gap-[5px] rounded-full px-2.5 py-[5px] text-[11.5px] font-extrabold", clases ? cn(clases.fondo, clases.tinta) : "bg-persona-1-tint text-teal-deep")}>
          <VitaIcon name="check" size={12} />
          Perfil creado
        </div>
      </div>
      <div className="flex flex-col border-t border-line-soft">
        {filas.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 border-b border-line-soft py-[9px]">
            <span className="text-[13px] font-semibold text-slate-brand">{k}</span>
            <span className={cn("flex min-w-0 flex-col text-right text-[13px] font-bold", v.length ? "text-foreground" : "text-subtle")}>
              {v.length ? v.map((linea, i) => <span key={i}>{linea}</span>) : "Sin cargar"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
