"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { VitaIcon } from "@/lib/vita-icons";
import { Chip } from "@/components/vita/chip";
import { VMark } from "@/components/vita/v-mark";
import { edadTexto } from "@/lib/perfil/formato";
import { useChatOverlay } from "@/lib/chat/overlay-context";
import { colorChipPorIndice } from "@/lib/perfil/tipos";
import { GENEROS, GRUPOS_SANGUINEOS, OTRA_PREPAGA, PREPAGAS_ARGENTINA } from "@/lib/perfil/opciones";
import type { Perfil } from "@/lib/perfil/tipos";
import {
  actualizarPerfilCompletoAction,
  agregarAlergiaAction,
  agregarCondicionAction,
  quitarAlergiaAction,
  quitarCondicionAction,
  type DatosPerfilCompleto,
} from "./actions";

export function ResumenSaludView({ perfil, email }: { perfil: Perfil; email: string }) {
  const { abrir } = useChatOverlay();

  return (
    <div className="flex flex-col gap-[22px] pb-28">
      {/* Hero */}
      <div className="rounded-[20px] bg-card p-[18px] shadow-card">
        <div className="flex items-center gap-3.5">
          <div className="flex size-[60px] shrink-0 items-center justify-center rounded-full bg-persona-1-tint font-heading text-2xl font-extrabold text-persona-1-deep">
            {(perfil.nombre ?? "?").charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-heading text-[18px] font-extrabold tracking-[-0.02em]">{perfil.nombre ?? "Sin nombre"}</div>
            <div className="mt-0.5 text-[11.5px] font-medium leading-snug text-subtle">
              {[edadTexto(perfil), perfil.genero, perfil.grupo_sanguineo && `Grupo ${perfil.grupo_sanguineo}`]
                .filter(Boolean)
                .join(" · ") || "Completá tus datos abajo"}
            </div>
          </div>
        </div>
        <div className="mt-3.5 flex flex-wrap gap-2">
          <Chip color="violet">{perfil.condiciones.length} condiciones</Chip>
          <Chip color="rose">{perfil.alergias.length} alergias</Chip>
        </div>
      </div>

      {/* vita shortcut */}
      <button
        type="button"
        onClick={() => abrir("Contame qué cambió de tu perfil de salud y lo actualizo.")}
        className="flex items-center gap-3 rounded-[20px] bg-card p-[15px] text-left shadow-card transition-transform active:scale-[0.99] motion-reduce:transition-none"
      >
        <VMark size={40} forma="circulo" className="shrink-0 rounded-full" />
        <div className="min-w-0 flex-1">
          <div className="font-heading text-[14.5px] font-extrabold tracking-[-0.02em]">Actualizar con vita</div>
          <div className="mt-0.5 text-[11.5px] font-medium text-subtle">Contame qué cambió y lo actualizo.</div>
        </div>
        <VitaIcon name="chevron-right" size={18} className="shrink-0 text-faint" />
      </button>

      <FormularioPerfil perfil={perfil} email={email} />

      <Condiciones condiciones={perfil.condiciones} />
      <Alergias alergias={perfil.alergias} />
    </div>
  );
}

// Todo el form de campos escalares en un solo lugar, con un único botón de
// guardar — reemplaza el patrón EditRow (un guardado por campo) del pase
// anterior.
function FormularioPerfil({ perfil, email }: { perfil: Perfil; email: string }) {
  const obraSocialEsPrepagaConocida =
    !!perfil.obra_social && (PREPAGAS_ARGENTINA as readonly string[]).includes(perfil.obra_social);

  const [datos, setDatos] = useState<DatosPerfilCompleto>({
    nombre: perfil.nombre ?? "",
    fechaNacimiento: perfil.fecha_nacimiento ?? "",
    genero: perfil.genero ?? "",
    grupoSanguineo: perfil.grupo_sanguineo ?? "",
    alturaCm: perfil.altura_cm?.toString() ?? "",
    pesoKg: perfil.peso_kg?.toString() ?? "",
    obraSocial: obraSocialEsPrepagaConocida ? perfil.obra_social! : perfil.obra_social ? OTRA_PREPAGA : "",
    numeroAfiliado: perfil.numero_afiliado ?? "",
    contactoEmergenciaNombre: perfil.contacto_emergencia_nombre ?? "",
    contactoEmergenciaTelefono: perfil.contacto_emergencia_telefono ?? "",
  });
  // Texto libre de la prepaga cuando se elige "Otra" — separado de `datos`
  // porque lo que se guarda en obraSocial es este valor, no "Otra" en sí.
  const [obraSocialOtra, setObraSocialOtra] = useState(obraSocialEsPrepagaConocida ? "" : (perfil.obra_social ?? ""));
  const [pendiente, startTransition] = useTransition();

  function campo<K extends keyof DatosPerfilCompleto>(clave: K, valor: string) {
    setDatos((prev) => ({ ...prev, [clave]: valor }));
  }

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    const aEnviar: DatosPerfilCompleto = {
      ...datos,
      obraSocial: datos.obraSocial === OTRA_PREPAGA ? obraSocialOtra : datos.obraSocial,
    };
    startTransition(async () => {
      const resultado = await actualizarPerfilCompletoAction(aEnviar);
      if (resultado.ok) toast.success("Perfil actualizado.");
      else toast.error(resultado.message);
    });
  }

  return (
    <form onSubmit={guardar} className="flex flex-col gap-[22px]">
      <Seccion titulo="Datos personales">
        <div className="flex flex-col gap-3.5">
          <Campo label="Nombre">
            <Input value={datos.nombre} onChange={(v) => campo("nombre", v)} />
          </Campo>
          <Campo label="Email">
            <div className="flex h-12 items-center rounded-full bg-secondary px-4 text-[14.5px] font-semibold text-subtle">{email}</div>
          </Campo>
          <Campo label="Fecha de nacimiento">
            <Input tipo="date" value={datos.fechaNacimiento} onChange={(v) => campo("fechaNacimiento", v)} />
          </Campo>
          <Campo label="Género">
            <Select
              value={datos.genero}
              onChange={(v) => campo("genero", v)}
              placeholder="Elegir…"
              opciones={GENEROS}
              valorLegacy={perfil.genero}
            />
          </Campo>
        </div>
      </Seccion>

      <Seccion titulo="Medidas">
        <div className="flex flex-col gap-3.5">
          <div className="flex gap-3">
            <Campo label="Altura (cm)">
              <Input tipo="number" value={datos.alturaCm} onChange={(v) => campo("alturaCm", v)} />
            </Campo>
            <Campo label="Peso (kg)">
              <Input tipo="number" value={datos.pesoKg} onChange={(v) => campo("pesoKg", v)} />
            </Campo>
          </div>
          <Campo label="Grupo sanguíneo">
            <Select
              value={datos.grupoSanguineo}
              onChange={(v) => campo("grupoSanguineo", v)}
              placeholder="Elegir…"
              opciones={GRUPOS_SANGUINEOS}
              valorLegacy={perfil.grupo_sanguineo}
            />
          </Campo>
        </div>
      </Seccion>

      <Seccion titulo="Cobertura médica">
        <div className="flex flex-col gap-3.5">
          <Campo label="Obra social / prepaga">
            <Select
              value={datos.obraSocial}
              onChange={(v) => campo("obraSocial", v)}
              placeholder="Elegir…"
              opciones={PREPAGAS_ARGENTINA}
              otra={{ value: OTRA_PREPAGA, label: "Otra" }}
            />
          </Campo>
          {datos.obraSocial === OTRA_PREPAGA && (
            <Campo label="¿Cuál?">
              <Input value={obraSocialOtra} onChange={setObraSocialOtra} placeholder="Nombre de tu obra social/prepaga" />
            </Campo>
          )}
          <Campo label="N° afiliado">
            <Input value={datos.numeroAfiliado} onChange={(v) => campo("numeroAfiliado", v)} />
          </Campo>
        </div>
      </Seccion>

      <Seccion titulo="Contacto de emergencia" subtitulo="Alguien a quien llamar en caso de urgencia">
        <div className="flex flex-col gap-3.5">
          <Campo label="Nombre y relación">
            <Input value={datos.contactoEmergenciaNombre} onChange={(v) => campo("contactoEmergenciaNombre", v)} />
          </Campo>
          <Campo label="Teléfono">
            <Input tipo="tel" value={datos.contactoEmergenciaTelefono} onChange={(v) => campo("contactoEmergenciaTelefono", v)} />
          </Campo>
        </div>
      </Seccion>

      {/* Espaciador para que el botón fijo no tape la última sección al
          hacer scroll hasta el final. */}
      <div className="h-16" />

      <div
        className="fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-md bg-gradient-to-t from-background from-70% to-transparent px-4 pt-4"
        style={{ paddingBottom: "var(--safe-bottom)" }}
      >
        <button
          type="submit"
          disabled={pendiente}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-4 font-heading text-[15px] font-extrabold text-primary-foreground shadow-[0_10px_24px_color-mix(in_srgb,var(--primary)_35%,transparent)] disabled:opacity-60"
        >
          {!pendiente && <VitaIcon name="check" size={16} strokeWidth={2.6} />}
          {pendiente ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </form>
  );
}

function Seccion({
  titulo,
  subtitulo,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="px-0.5 pb-[9px]">
        <h2 className="eyebrow text-primary">{titulo}</h2>
        {subtitulo && <div className="mt-1 text-[11.5px] font-medium text-subtle">{subtitulo}</div>}
      </div>
      {children}
    </section>
  );
}

const CLASE_CAMPO =
  "h-12 w-full rounded-full bg-card px-4 text-[14.5px] font-semibold shadow-item outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex-1">
      <div className="eyebrow mb-1.5 px-1 text-subtle">{label}</div>
      {children}
    </div>
  );
}

function Input({
  value,
  onChange,
  tipo = "text",
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  tipo?: "text" | "number" | "date" | "tel";
  placeholder?: string;
}) {
  return (
    <input
      type={tipo}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={CLASE_CAMPO}
    />
  );
}

function Select({
  value,
  onChange,
  opciones,
  placeholder,
  valorLegacy,
  otra,
}: {
  value: string;
  onChange: (v: string) => void;
  opciones: readonly string[];
  placeholder: string;
  // Si el perfil ya tenía un valor de texto libre (dato viejo, de antes de
  // este picker) que no está en la lista, se muestra igual como opción
  // extra para no perderlo silenciosamente al abrir el form.
  valorLegacy?: string | null;
  // Opción "Otra" con un value interno distinto de su label — necesario
  // para no colisionar con un valor legacy que ya fuera literalmente ese
  // mismo texto (ver OTRA_PREPAGA en lib/perfil/opciones.ts).
  otra?: { value: string; label: string };
}) {
  const todasLasOpciones =
    valorLegacy && !opciones.includes(valorLegacy) ? [valorLegacy, ...opciones] : opciones;

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={CLASE_CAMPO}
    >
      <option value="">{placeholder}</option>
      {todasLasOpciones.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
      {otra && <option value={otra.value}>{otra.label}</option>}
    </select>
  );
}

function Condiciones({ condiciones }: { condiciones: Perfil["condiciones"] }) {
  const [agregando, setAgregando] = useState(false);
  const [label, setLabel] = useState("");
  const [pendiente, startTransition] = useTransition();

  function agregar() {
    if (!label.trim()) return;
    const valor = label.trim();
    startTransition(async () => {
      const resultado = await agregarCondicionAction(valor, "permanente", new Date().getFullYear().toString());
      if (resultado.ok) {
        setLabel("");
        setAgregando(false);
      } else {
        toast.error(resultado.message);
      }
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between px-0.5 pb-[9px]">
        <h2 className="eyebrow text-primary">Condiciones</h2>
        <button type="button" onClick={() => setAgregando((v) => !v)} className="text-[13px] font-bold text-teal-deep">
          + Agregar
        </button>
      </div>
      <div className="overflow-hidden rounded-[20px] bg-card shadow-card">
        {agregando && (
          <div className="flex gap-2 border-b p-3.5">
            <input
              autoFocus
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && agregar()}
              placeholder="Ej. Hipertensión"
              className="h-10 min-w-0 flex-1 rounded-full bg-secondary px-4 text-sm font-semibold outline-none"
            />
            <button
              type="button"
              onClick={agregar}
              disabled={pendiente}
              className="rounded-full bg-primary px-4 py-2 font-heading text-xs font-extrabold text-primary-foreground disabled:opacity-60"
            >
              Agregar
            </button>
          </div>
        )}
        {condiciones.length === 0 ? (
          <p className="p-4 text-[13px] font-medium text-subtle">Sin condiciones cargadas.</p>
        ) : (
          condiciones.map((c, i) => (
            <div key={c.label} className={`flex items-center gap-3 p-3.5 ${i < condiciones.length - 1 ? "border-b" : ""}`}>
              <Chip color={colorChipPorIndice(i)}>{c.label}</Chip>
              <div className="flex-1 text-[11.5px] font-medium capitalize text-subtle">
                {c.tipo} · desde {c.desde}
              </div>
              <button
                type="button"
                onClick={() =>
                  startTransition(async () => {
                    const resultado = await quitarCondicionAction(c.label);
                    if (!resultado.ok) toast.error(resultado.message);
                  })
                }
                aria-label={`Quitar ${c.label}`}
              >
                <VitaIcon name="close" size={14} className="text-faint" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function Alergias({ alergias }: { alergias: string[] }) {
  const [agregando, setAgregando] = useState(false);
  const [valor, setValor] = useState("");
  const [pendiente, startTransition] = useTransition();

  function agregar() {
    if (!valor.trim()) return;
    const nueva = valor.trim();
    startTransition(async () => {
      const resultado = await agregarAlergiaAction(nueva);
      if (resultado.ok) {
        setValor("");
        setAgregando(false);
      } else {
        toast.error(resultado.message);
      }
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between px-0.5 pb-[9px]">
        <h2 className="eyebrow text-primary">Alergias</h2>
        <button type="button" onClick={() => setAgregando((v) => !v)} className="text-[13px] font-bold text-teal-deep">
          + Agregar
        </button>
      </div>
      <div className="rounded-[20px] bg-card p-3.5 shadow-card">
        <div className="flex flex-wrap gap-2">
          {alergias.map((a) => (
            <span key={a} className="inline-flex items-center gap-1.5 rounded-full bg-chip-rose-bg py-1.5 pl-3 pr-1.5 text-[12.5px] font-semibold text-chip-rose-ink">
              {a}
              <button
                type="button"
                onClick={() =>
                  startTransition(async () => {
                    const resultado = await quitarAlergiaAction(a);
                    if (!resultado.ok) toast.error(resultado.message);
                  })
                }
                aria-label={`Quitar ${a}`}
                className="flex size-[18px] items-center justify-center rounded-full bg-foreground/[0.06]"
              >
                <VitaIcon name="close" size={10} />
              </button>
            </span>
          ))}
          {agregando ? (
            <input
              autoFocus
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && agregar()}
              onBlur={agregar}
              placeholder="Nueva alergia"
              disabled={pendiente}
              className="rounded-full bg-secondary px-3.5 py-1.5 text-[12.5px] font-semibold outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => setAgregando(true)}
              className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[12.5px] font-semibold text-slate-brand shadow-[inset_0_0_0_1px_var(--border)]"
            >
              <VitaIcon name="plus" size={12} /> Agregar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
