"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { colorChipPorIndice, type UsoApp } from "@/lib/perfil/tipos";
import { HORA_POR_MOMENTO, type MomentoDia } from "@/lib/medicamentos/tipos";
import { ETIQUETA_MOMENTO, ORDEN_MOMENTOS } from "@/lib/rutina/momento";
import { VitaIcon } from "@/lib/vita-icons";
import type { MedicamentoExtraido } from "@/lib/onboarding/extraer";
import { Burbuja, CampoEntrada, ChipBoton, EncabezadoConversar, PuntosEscribiendo, type Mensaje } from "./componentes";
import {
  contarMedicamentosPendientesAction,
  crearPerfilPendienteAction,
  extraerMedicamentosAction,
  extraerNombreEdadAction,
  finalizarConCuidadoAction,
  finalizarSoloYoAction,
  guardarMedicamentoPendienteAction,
  guardarMedicamentoPropioAction,
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

const RELACIONES = ["Mamá", "Papá", "Abuela/o", "Otro"] as const;
const COLOR_LABEL: Record<string, string> = { teal: "teal", violet: "violeta", amber: "ámbar", rose: "rosa" };

function articuloRelacion(relacion: string): string {
  if (relacion === "Mamá") return "tu mamá";
  if (relacion === "Papá") return "tu papá";
  if (relacion === "Abuela/o") return "tu abuela o abuelo";
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
  | { tipo: "consentimiento"; nombre: string; autorizado: boolean }
  | { tipo: "pedir-medicamentos"; contexto: "persona" | "vos" }
  | { tipo: "confirmar-medicamentos"; contexto: "persona" | "vos"; items: ItemCard[] }
  | { tipo: "handoff-vos" }
  | { tipo: "fin" };

function mensajeInicial(usoApp: UsoApp): Mensaje {
  if (usoApp === "yo") {
    return {
      id: "vita-0",
      from: "vita",
      texto: "¡Hola! Soy vita 👋 Contame qué medicamentos tomás — decímelos como te salga, yo los ordeno.",
    };
  }
  return { id: "vita-0", from: "vita", texto: "¡Hola! Soy vita. Empecemos por la persona que cuidás. ¿Quién es?" };
}

export function ConversarOnboarding({ usoApp }: { usoApp: UsoApp }) {
  const dosTabs = usoApp !== "yo";

  const [mensajes, setMensajes] = useState<Mensaje[]>(() => [mensajeInicial(usoApp)]);
  const [escribiendo, setEscribiendo] = useState(false);
  const [vista, setVista] = useState<Vista>(
    dosTabs ? { tipo: "relacion" } : { tipo: "pedir-medicamentos", contexto: "vos" }
  );
  const [tabActiva, setTabActiva] = useState<"persona" | "vos">("persona");
  const [personaCompleta, setPersonaCompleta] = useState(false);
  const [nombrePersona, setNombrePersona] = useState<string | null>(null);
  const [edadPersona, setEdadPersona] = useState<number | null>(null);
  const [resumenCantidad, setResumenCantidad] = useState(0);
  const [perfilPendienteId, setPerfilPendienteId] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(1);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [mensajes, escribiendo]);

  function nuevoId(): string {
    return `m-${idRef.current++}`;
  }

  function agregarBurbujaUsuario(texto: string, audioSeg?: number) {
    setMensajes((prev) => [...prev, { id: nuevoId(), from: "user", texto, audioSeg }]);
  }

  function agregarBurbujaVita(texto: string) {
    setMensajes((prev) => [...prev, { id: nuevoId(), from: "vita", texto }]);
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

    await crearPerfilYSeguir(relacion, resultado.nombre, resultado.edad);
  }

  async function crearPerfilYSeguir(relacion: string, nombre: string, edad: number | null) {
    setEscribiendo(true);
    const creado = await crearPerfilPendienteAction({ nombre, relacion, edad });
    setEscribiendo(false);

    if (creado.status === "error") {
      toast.error(`No pudimos crear el perfil: ${creado.message}`);
      setVista({ tipo: "nombre-edad-manual", relacion, nombreSugerido: nombre });
      return;
    }

    const color = COLOR_LABEL[colorChipPorIndice(1)] ?? "violeta";
    agregarBurbujaVita(
      `Perfecto, voy a crear el perfil de ${nombre}. Le asigno el color ${color} para que siempre sepas cuándo estás viendo lo suyo.`
    );
    setNombrePersona(nombre);
    setEdadPersona(edad);
    setPerfilPendienteId(creado.perfilPendienteId);

    window.setTimeout(() => {
      agregarBurbujaVita("Antes de seguir, necesito que me confirmes una cosa. Son datos de salud, así que los cuidamos mucho.");
      setVista({ tipo: "consentimiento", nombre, autorizado: false });
    }, 450);
  }

  function confirmarConsentimiento(nombre: string) {
    agregarBurbujaVita(`¿Qué remedios toma ${nombre}? Decímelos como te salga, yo los ordeno.`);
    setVista({ tipo: "pedir-medicamentos", contexto: "persona" });
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
    if (contexto === "persona" && !perfilPendienteId) {
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

    const resultado =
      contexto === "persona"
        ? await guardarMedicamentoPendienteAction(perfilPendienteId as string, datos)
        : await guardarMedicamentoPropioAction(datos);

    if (resultado.status === "error") {
      toast.error(`No se pudo guardar ${item.nombre}: ${resultado.message}`);
      actualizarItem(item.clientId, { guardando: false });
      return;
    }

    actualizarItem(item.clientId, { guardando: false, guardado: true, editando: false });
  }

  function pedirOtroMedicamento(contexto: "persona" | "vos") {
    agregarBurbujaVita(contexto === "persona" ? `¿Algún otro remedio de ${nombrePersona ?? "esta persona"}?` : "¿Algún otro remedio tuyo?");
    setVista({ tipo: "pedir-medicamentos", contexto });
  }

  async function terminarMedicamentosPersona() {
    setEscribiendo(true);
    const conteo = perfilPendienteId ? await contarMedicamentosPendientesAction(perfilPendienteId) : null;
    setEscribiendo(false);

    setResumenCantidad(conteo?.status === "success" ? conteo.cantidad : 0);
    setPersonaCompleta(true);
    agregarBurbujaVita(`¡Listo! El perfil de ${nombrePersona ?? "la persona que cuidás"} quedó armado.`);

    window.setTimeout(() => {
      agregarBurbujaVita("Ahora vamos con vos. ¿Cargamos lo tuyo ahora o lo dejamos para después?");
      setVista({ tipo: "handoff-vos" });
    }, 650);
  }

  function irAVosAhora() {
    setTabActiva("vos");
    agregarBurbujaVita("¿Y vos? ¿Qué remedios tomás? Contame como te salga.");
    setVista({ tipo: "pedir-medicamentos", contexto: "vos" });
  }

  async function irADespues() {
    if (!perfilPendienteId) return;
    setVista({ tipo: "fin" });
    await finalizarConCuidadoAction(perfilPendienteId);
  }

  async function terminarMedicamentosVos() {
    setVista({ tipo: "fin" });
    if (dosTabs && perfilPendienteId) {
      await finalizarConCuidadoAction(perfilPendienteId);
    } else {
      await finalizarSoloYoAction();
    }
  }

  const tabs = dosTabs
    ? [
        {
          label: personaCompleta ? `1 · ${nombrePersona ?? "Persona"} ✓` : `1 · ${nombrePersona ?? "La persona que cuidás"}`,
          estado: (personaCompleta ? "completo" : tabActiva === "persona" ? "activo" : "inactivo") as "activo" | "inactivo" | "completo",
          color: "violet" as const,
        },
        { label: "2 · Vos", estado: (tabActiva === "vos" ? "activo" : "inactivo") as "activo" | "inactivo", color: "teal" as const },
      ]
    : [];

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">
      {/* /onboarding/nombre, no /onboarding/chat directo -- conserva el paso
          de nombre del guion viejo en vez de saltarlo (el perfil ya viene
          con el nombre de Google, pero así la persona lo puede corregir
          antes de seguir, como en el flujo original). */}
      <EncabezadoConversar tabs={tabs} linkFormulario="/onboarding/nombre" />

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-2">
        {mensajes.map((m) => (
          <Burbuja key={m.id} m={m} />
        ))}
        {escribiendo && <PuntosEscribiendo />}

        {!escribiendo && vista.tipo === "relacion" && (
          <div className="flex flex-wrap gap-1.5 pl-9">
            {RELACIONES.map((r) => (
              <ChipBoton key={r} texto={r} onClick={() => elegirRelacion(r)} />
            ))}
          </div>
        )}

        {!escribiendo && vista.tipo === "nombre-edad" && (
          <div className="pl-9">
            <CampoEntrada onEnviar={(texto, audioSeg) => responderNombreEdad(vista.relacion, texto, audioSeg)} placeholder="Nombre y edad…" />
          </div>
        )}

        {!escribiendo && vista.tipo === "nombre-edad-manual" && (
          <div className="pl-9">
            <FormularioNombreEdadManual
              relacion={vista.relacion}
              nombreInicial={vista.nombreSugerido}
              onGuardar={(nombre, edad) => crearPerfilYSeguir(vista.relacion, nombre, edad)}
            />
          </div>
        )}

        {!escribiendo && vista.tipo === "consentimiento" && (
          <div className="pl-9">
            <TarjetaConsentimiento
              nombre={vista.nombre}
              autorizado={vista.autorizado}
              onToggle={(v) => setVista((prev) => (prev.tipo === "consentimiento" ? { ...prev, autorizado: v } : prev))}
              onConfirmar={() => confirmarConsentimiento(vista.nombre)}
            />
          </div>
        )}

        {!escribiendo && vista.tipo === "pedir-medicamentos" && (
          <div className="pl-9">
            <CampoEntrada onEnviar={(texto, audioSeg) => responderMedicamentos(vista.contexto, texto, audioSeg)} placeholder="Ej: Losartán de 50, a la mañana" />
          </div>
        )}

        {!escribiendo && vista.tipo === "confirmar-medicamentos" && (
          <div className="flex flex-col gap-2.5 pl-9">
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
                className="rounded-full bg-secondary px-3.5 py-2 text-[12px] font-semibold text-muted-foreground"
              >
                + Agregar otro a mano
              </button>
              <button
                type="button"
                onClick={() => pedirOtroMedicamento(vista.contexto)}
                className="rounded-full bg-secondary px-3.5 py-2 text-[12px] font-semibold text-muted-foreground"
              >
                + Otro remedio
              </button>
              <button
                type="button"
                onClick={() => (vista.contexto === "persona" ? terminarMedicamentosPersona() : terminarMedicamentosVos())}
                className="rounded-full bg-primary px-4 py-2 text-[12px] font-bold text-primary-foreground"
              >
                Listo por ahora
              </button>
            </div>
          </div>
        )}

        {!escribiendo && vista.tipo === "handoff-vos" && (
          <div className="flex flex-col gap-3 pl-9">
            <TarjetaResumenPersona nombre={nombrePersona} edad={edadPersona} cantidad={resumenCantidad} />
            <div className="flex gap-2">
              <button type="button" onClick={irAVosAhora} className="flex-1 rounded-full bg-primary py-3 text-[13.5px] font-bold text-primary-foreground">
                Ahora
              </button>
              <button type="button" onClick={irADespues} className="flex-1 rounded-full bg-secondary py-3 text-[13.5px] font-semibold">
                Después
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
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
    <div className="flex flex-col gap-2.5 rounded-[20px] bg-card p-3.5 shadow-[var(--shadow-card,0_8px_24px_rgba(15,33,54,0.06))]">
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
    <div className="flex flex-col gap-3 rounded-[20px] bg-card p-4 shadow-[var(--shadow-card,0_8px_24px_rgba(15,33,54,0.06))]">
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
    <div className="flex flex-col gap-2.5 rounded-[20px] bg-card p-3.5 shadow-[var(--shadow-card,0_8px_24px_rgba(15,33,54,0.06))]">
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

function TarjetaResumenPersona({ nombre, edad, cantidad }: { nombre: string | null; edad: number | null; cantidad: number }) {
  const inicial = (nombre ?? "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <div className="flex flex-col gap-3 rounded-[22px] p-4 text-white" style={{ background: "linear-gradient(135deg, #7c3aed, #5b21b6)" }}>
      <div className="flex items-center gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/20 font-heading text-[18px] font-extrabold">{inicial}</div>
        <div>
          <div className="font-heading text-[16px] font-extrabold">{nombre ?? "Persona"}</div>
          {edad !== null && <div className="text-[12.5px] text-white/80">{edad} años</div>}
        </div>
      </div>
      <div className="rounded-[16px] bg-white/15 px-4 py-3 text-center">
        <div className="font-heading text-[22px] font-extrabold">{cantidad}</div>
        <div className="text-[11.5px] text-white/80">{cantidad === 1 ? "remedio" : "remedios"}</div>
      </div>
    </div>
  );
}
