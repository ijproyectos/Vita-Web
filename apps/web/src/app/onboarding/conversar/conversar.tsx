"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { MedicionesEnCasa, UsoApp } from "@/lib/perfil/tipos";
import { CLASES_COLOR } from "@/lib/familia/colores";
import type { ColorPerfil } from "@/lib/familia/tipos";
import { generarCodigoAccesoAction } from "@/app/cuidar/[elderId]/actions";
import { HORA_POR_MOMENTO, type MomentoDia } from "@/lib/medicamentos/tipos";
import { ETIQUETA_MOMENTO, ORDEN_MOMENTOS } from "@/lib/rutina/momento";
import { VitaIcon } from "@/lib/vita-icons";
import type { MedicamentoExtraido } from "@/lib/onboarding/extraer";
import { Burbuja, CampoEntrada, ChipBoton, ChipsMulti, EncabezadoConversar, PuntosEscribiendo, TarjetaCodigoCompartir, type Mensaje } from "./componentes";
import {
  crearPerfilFamiliarAction,
  extraerMedicamentosAction,
  extraerNombreEdadAction,
  finalizarOnboardingAction,
  guardarAlergiasPropiasAction,
  guardarCondicionesPropiasAction,
  guardarMedicamentoPropioAction,
  guardarMedicionesEnCasaAction,
  guardarTurnoPropioAction,
  marcarUsoAmbosAction,
  type DatosMedicamentoConfirmado,
} from "./actions";

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

type PasoChips = "med" | "turno" | "turno-spec" | "meas";
const OPCIONES_CHIPS: Record<PasoChips, readonly string[]> = {
  med: ["Sí", "No", "Saltear"],
  turno: ["Sí", "No", "Saltear"],
  "turno-spec": ESPECIALIDADES,
  meas: ["Presión", "Azúcar", "Las dos", "No", "Saltear"],
};

type ResumenPropio = { cond: string[]; alergias: string[]; meds: number; turno: string | null; meas: string | null };
const RESUMEN_VACIO: ResumenPropio = { cond: [], alergias: [], meds: 0, turno: null, meas: null };

// Chip de mediciones -> valor de perfiles.mediciones_en_casa ("Saltear" no guarda nada).
const MEDICIONES_POR_CHIP: Record<string, MedicionesEnCasa | undefined> = {
  Presión: "presion",
  Azúcar: "glucemia",
  "Las dos": "ambas",
  No: "ninguna",
};

const RELACIONES = ["Mamá", "Papá", "Hijo/a", "Pareja", "Abuelo/a", "Otro"] as const;
const ETIQUETA_COLOR: Record<ColorPerfil, string> = { teal: "verde agua", violeta: "violeta", ambar: "ámbar", rosa: "rosa", azul: "azul" };

// Pasada esta edad vita pregunta si no fue un error de tipeo.
const EDAD_SOSPECHOSA = 120;

function articuloRelacion(relacion: string): string {
  if (relacion === "Mamá") return "tu mamá";
  if (relacion === "Papá") return "tu papá";
  if (relacion === "Hijo/a") return "tu hijo o hija";
  if (relacion === "Pareja") return "tu pareja";
  if (relacion === "Abuelo/a") return "tu abuela o abuelo";
  return "esa persona";
}

type ItemCard = {
  clientId: string;
  nombre: string;
  dosis: string;
  unidad: string;
  momentos: MomentoDia[];
  frecuencia: string;
  editando: boolean;
  guardando: boolean;
  guardado: boolean;
};

function itemVacio(): ItemCard {
  return {
    clientId: `manual-${Date.now()}`,
    nombre: "",
    dosis: "",
    unidad: "mg",
    momentos: [],
    frecuencia: "",
    editando: true,
    guardando: false,
    guardado: false,
  };
}

function itemsDesdeExtraccion(medicamentos: MedicamentoExtraido[]): ItemCard[] {
  return medicamentos.map((m, i) => ({
    clientId: `ext-${Date.now()}-${i}`,
    nombre: m.nombre,
    dosis: m.dosis ?? "",
    unidad: m.unidad || "mg",
    momentos: m.momentos.length > 0 ? m.momentos : (["mañana"] as MomentoDia[]),
    frecuencia: m.frecuencia ?? "",
    editando: false,
    guardando: false,
    guardado: false,
  }));
}

type Vista =
  | { tipo: "relacion" }
  | { tipo: "nombre-edad"; relacion: string }
  | { tipo: "nombre-edad-manual"; relacion: string; nombreSugerido: string }
  | { tipo: "edad-confirmar"; relacion: string; nombre: string; edad: number }
  | { tipo: "edad-corregir"; relacion: string; nombre: string }
  | { tipo: "consentimiento"; nombre: string; autorizado: boolean }
  | { tipo: "pedir-medicamentos"; contexto: "persona" | "vos" }
  | { tipo: "confirmar-medicamentos"; contexto: "persona" | "vos"; items: ItemCard[] }
  | { tipo: "handoff-vos" }
  | { tipo: "multi"; paso: "cond" | "alergia"; seleccion: string[] }
  | { tipo: "chips"; paso: PasoChips }
  | { tipo: "turno-spec-texto" }
  | { tipo: "turno-fecha"; especialidad: string }
  | { tipo: "turno-lugar"; especialidad: string; fecha: string; hora: string }
  | { tipo: "resumen-propio" }
  | { tipo: "compartir" }
  | { tipo: "codigo"; codigo: string }
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

  // La edad se confirma antes de crear nada: un 0 o un número disparatado casi
  // siempre es un error de tipeo o de dictado.
  async function validarEdadYSeguir(relacion: string, nombre: string, edad: number | null) {
    if (edad !== null && (!Number.isFinite(edad) || edad <= 0)) {
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

  async function crearPerfilYSeguir(relacion: string, nombre: string, edad: number | null) {
    setEscribiendo(true);
    const creado = await crearPerfilFamiliarAction({ nombre, relacion, edad });
    setEscribiendo(false);

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
    decir(`¿${nombre} tiene alguna condición de salud? Podés marcar varias.`);
    setVista({ tipo: "multi", paso: "cond", seleccion: [] });
  }

  // ---- Medicamentos (persona o "vos") --------------------------------------

  async function responderMedicamentos(contexto: "persona" | "vos", texto: string, audioSeg?: number) {
    agregarBurbujaUsuario(texto, audioSeg);
    setEscribiendo(true);

    const resultado = await extraerMedicamentosAction(texto);
    setEscribiendo(false);

    if (resultado.status === "error") {
      agregarBurbujaVita(`No llegué a entender bien eso (${resultado.message}). Lo cargamos a mano.`);
      setVista({ tipo: "confirmar-medicamentos", contexto, items: [itemVacio()] });
      return;
    }

    setVista({ tipo: "confirmar-medicamentos", contexto, items: itemsDesdeExtraccion(resultado.medicamentos) });
  }

  function actualizarItem(clientId: string, cambios: Partial<ItemCard>) {
    setVista((v) => (v.tipo === "confirmar-medicamentos" ? { ...v, items: v.items.map((it) => (it.clientId === clientId ? { ...it, ...cambios } : it)) } : v));
  }

  function agregarItemManual() {
    setVista((v) => (v.tipo === "confirmar-medicamentos" ? { ...v, items: [...v.items, itemVacio()] } : v));
  }

  async function guardarItem(contexto: "persona" | "vos", item: ItemCard) {
    if (!item.nombre.trim() || item.momentos.length === 0) {
      toast.error("Falta el nombre o el momento del día.");
      return;
    }
    if (contexto === "persona" && !personaId) {
      toast.error("No encontramos el perfil de la persona. Recargá la página.");
      return;
    }

    actualizarItem(item.clientId, { guardando: true });

    const datos: DatosMedicamentoConfirmado = {
      nombre: item.nombre.trim(),
      dosis: item.dosis.trim() || null,
      unidad: item.unidad.trim() || "mg",
      momentos: item.momentos,
      frecuencia: item.frecuencia.trim() || null,
    };

    const resultado = await guardarMedicamentoPropioAction(datos, contexto === "persona" ? (personaId as string) : undefined);

    if (resultado.status === "error") {
      toast.error(`No se pudo guardar ${item.nombre}: ${resultado.message}`);
      actualizarItem(item.clientId, { guardando: false });
      return;
    }

    setHayAvance(true);
    setResumen((r) => ({ ...r, meds: r.meds + 1 }));
    actualizarItem(item.clientId, { guardando: false, guardado: true, editando: false });
  }

  function pedirOtroMedicamento(contexto: "persona" | "vos") {
    agregarBurbujaVita(contexto === "persona" ? `¿Algún otro remedio de ${nombrePersona ?? "esta persona"}?` : "¿Algún otro remedio tuyo?");
    setVista({ tipo: "pedir-medicamentos", contexto });
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

  async function compartirCodigo() {
    if (!personaId) return;
    agregarBurbujaUsuario("Compartir código");
    setEscribiendo(true);
    const r = await generarCodigoAccesoAction(personaId).catch(() => null);
    setEscribiendo(false);

    if (!r || r.status === "error") {
      toast.error(r?.message ?? "No pudimos generar el código. Probá de nuevo.");
      return;
    }
    decir(`Listo, este es el código para ${nombrePersona ?? "esa persona"}.`);
    setVista({ tipo: "codigo", codigo: r.codigo });
  }

  function noCompartirAhora() {
    agregarBurbujaUsuario("Ahora no");
    decir(`Vos manejás el perfil de ${nombrePersona ?? "esa persona"} y, si después querés, se lo compartís desde Familia.`);
    preguntarSumarse();
  }

  function preguntarSumarse() {
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
        if (valor === "Sí") {
          decir(q((n) => `Contame cuáles toma ${n} — decímelos como te salga, yo los ordeno.`, "Contame cuáles — decímelos como te salga, yo los ordeno."));
          setVista({ tipo: "pedir-medicamentos", contexto: esPersona ? "persona" : "vos" });
        } else {
          preguntarTurno(valor === "Saltear" ? "Perfecto." : "Buenísimo.");
        }
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
        if (guardar) {
          void guardarMedicionesEnCasaAction(guardar, esPersona ? personaId ?? undefined : undefined).then((r) => {
            if (r.status === "error") toast.error("No pudimos guardar esa respuesta, la podés cargar después.");
          });
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
  async function terminarTodo() {
    const r = await finalizarOnboardingAction();
    if (r?.status === "error") {
      toast.error("No pudimos guardar. Probá de nuevo.");
      return;
    }
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
    else if (vista.tipo === "pedir-medicamentos") responderMedicamentos(vista.contexto, texto, audioSeg);
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
        {mensajes.map((m, i) => (
          <Burbuja key={m.id} m={m} conAvatar={mensajes[i + 1] ? mensajes[i + 1].from !== "vita" : !escribiendo} />
        ))}
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

        {!escribiendo && vista.tipo === "confirmar-medicamentos" && (
          <div className="flex flex-col gap-2.5 pl-[46px]">
            {vista.items.map((item) => (
              <TarjetaMedicamento
                key={item.clientId}
                item={item}
                etiquetaPara={vista.contexto === "persona" ? nombrePersona ?? "la persona que cuidás" : "vos"}
                onCambiar={(c) => actualizarItem(item.clientId, c)}
                onEditar={() => actualizarItem(item.clientId, { editando: !item.editando })}
                onGuardar={() => guardarItem(vista.contexto, item)}
              />
            ))}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={agregarItemManual}
                className="rounded-full border border-teal-line bg-card px-3.5 py-2.5 text-[12.5px] font-bold text-slate-brand"
              >
                + Agregar otro a mano
              </button>
              <button
                type="button"
                onClick={() => pedirOtroMedicamento(vista.contexto)}
                className="rounded-full border border-teal-line bg-card px-3.5 py-2.5 text-[12.5px] font-bold text-slate-brand"
              >
                + Otro remedio
              </button>
              <button
                type="button"
                onClick={terminarMedicamentos}
                className="rounded-full bg-primary px-4 py-2 text-[12px] font-bold text-primary-foreground"
              >
                Listo por ahora
              </button>
            </div>
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

        {!escribiendo && vista.tipo === "codigo" && (
          <div className="flex flex-col gap-3 pl-[46px]">
            <TarjetaCodigoCompartir nombre={nombrePersona ?? "esa persona"} codigo={vista.codigo} />
            <button type="button" onClick={preguntarSumarse} className="h-12 rounded-full bg-primary text-[14px] font-extrabold text-primary-foreground shadow-cta">
              Seguir
            </button>
          </div>
        )}

        {!escribiendo && vista.tipo === "resumen-propio" && (
          <div className="flex flex-col gap-3 pl-[46px]">
            <TarjetaResumenPropia resumen={resumen} />
            <button type="button" onClick={terminarTodo} className="h-12 rounded-full bg-primary text-[15px] font-extrabold text-primary-foreground shadow-cta">
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
    case "pedir-medicamentos":
      return "Ej: Losartán de 50, a la mañana";
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
}: {
  nombre: string;
  autorizado: boolean;
  onToggle: (v: boolean) => void;
  onConfirmar: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-[20px] bg-card p-4 shadow-card">
      <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Perfil de {nombre}</div>
      <label className="flex items-start gap-2.5">
        <input type="checkbox" checked={autorizado} onChange={(e) => onToggle(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-primary" />
        <span className="text-[13.5px] font-semibold leading-snug">Tengo autorización de {nombre} para cargar y gestionar sus datos de salud.</span>
      </label>
      <p className="text-[12px] text-muted-foreground">Solo vos y quien vos invites pueden ver estos datos. Podés borrar el perfil cuando quieras.</p>
      <button
        type="button"
        disabled={!autorizado}
        onClick={onConfirmar}
        className="h-12 rounded-full bg-primary text-[14px] font-bold text-primary-foreground disabled:opacity-50"
      >
        Confirmar
      </button>
    </div>
  );
}

function TarjetaMedicamento({
  item,
  etiquetaPara,
  onCambiar,
  onEditar,
  onGuardar,
}: {
  item: ItemCard;
  etiquetaPara: string;
  onCambiar: (cambios: Partial<ItemCard>) => void;
  onEditar: () => void;
  onGuardar: () => void;
}) {
  if (item.guardado && !item.editando) {
    return (
      <div className="flex items-center justify-between rounded-[16px] bg-chip-teal-bg px-4 py-3 text-chip-teal-ink">
        <div>
          <div className="text-[13.5px] font-bold">
            {item.nombre} {[item.dosis, item.unidad].filter(Boolean).join(" ")}
          </div>
          <div className="text-[11.5px]">{item.momentos.map((m) => ETIQUETA_MOMENTO[m]).join(" · ")}</div>
        </div>
        <VitaIcon name="check" size={18} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-[20px] bg-card p-3.5 shadow-card">
      {item.editando ? (
        <>
          <input
            value={item.nombre}
            onChange={(e) => onCambiar({ nombre: e.target.value })}
            placeholder="Nombre del remedio"
            className="rounded-[14px] bg-secondary px-3 py-2 text-[13px] font-semibold outline-none"
          />
          <div className="flex gap-2">
            <input
              value={item.dosis}
              onChange={(e) => onCambiar({ dosis: e.target.value })}
              placeholder="Dosis"
              className="flex-1 rounded-[14px] bg-secondary px-3 py-2 text-[13px] outline-none"
            />
            <input
              value={item.unidad}
              onChange={(e) => onCambiar({ unidad: e.target.value })}
              placeholder="Unidad"
              className="w-20 rounded-[14px] bg-secondary px-3 py-2 text-[13px] outline-none"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ORDEN_MOMENTOS.map((m) => {
              const sel = item.momentos.includes(m);
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => onCambiar({ momentos: sel ? item.momentos.filter((x) => x !== m) : [...item.momentos, m] })}
                  className={cn("rounded-full px-3 py-1.5 text-[12px] font-semibold", sel ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground")}
                >
                  {ETIQUETA_MOMENTO[m]}
                </button>
              );
            })}
          </div>
          <input
            value={item.frecuencia}
            onChange={(e) => onCambiar({ frecuencia: e.target.value })}
            placeholder="Frecuencia (opcional)"
            className="rounded-[14px] bg-secondary px-3 py-2 text-[13px] outline-none"
          />
        </>
      ) : (
        <>
          <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Para: {etiquetaPara}</div>
          <div className="font-heading text-[19px] font-extrabold">{[item.nombre, item.dosis, item.unidad].filter(Boolean).join(" ")}</div>
          <div className="text-[13px] text-muted-foreground">{item.frecuencia || "Frecuencia sin especificar"}</div>
          <div className="flex flex-wrap gap-1.5">
            {item.momentos.map((m) => (
              <span key={m} className="rounded-full bg-secondary px-3 py-1.5 text-[12px] font-semibold">
                {HORA_POR_MOMENTO[m]}
              </span>
            ))}
          </div>
        </>
      )}
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onEditar} disabled={item.guardando} className="flex-1 rounded-full bg-secondary py-2 text-[12.5px] font-semibold disabled:opacity-50">
          {item.editando ? "Listo" : "Editar"}
        </button>
        <button type="button" onClick={onGuardar} disabled={item.guardando} className="flex-1 rounded-full bg-primary py-2 text-[12.5px] font-bold text-primary-foreground disabled:opacity-50">
          {item.guardando ? "Guardando…" : "Guardar"}
        </button>
      </div>
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
  const filas: [string, string | null][] = [
    ["Condición", resumen.cond.length ? resumen.cond.join(", ") : null],
    ["Alergia", resumen.alergias.length ? resumen.alergias.join(", ") : null],
    ["Remedio", resumen.meds > 0 ? `${resumen.meds} ${resumen.meds === 1 ? "remedio" : "remedios"}` : null],
    ["Turno", resumen.turno],
    ["Mediciones", resumen.meas],
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
            <span className={cn("text-right text-[13px] font-bold", v ? "text-foreground" : "text-subtle")}>{v ?? "Sin cargar"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
