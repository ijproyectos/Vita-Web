"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { VitaIcon } from "@/lib/vita-icons";
import { Chip } from "@/components/vita/chip";
import { useChatOverlay } from "@/lib/chat/overlay-context";
import { colorChipPorIndice } from "@/lib/perfil/tipos";
import type { Perfil } from "@/lib/perfil/tipos";
import {
  actualizarCampoAction,
  agregarAlergiaAction,
  agregarCondicionAction,
  quitarAlergiaAction,
  quitarCondicionAction,
} from "./actions";

export function ResumenSaludView({ perfil, email }: { perfil: Perfil; email: string }) {
  const { abrir } = useChatOverlay();

  return (
    <div className="flex flex-col gap-4.5 pb-8">
      {/* Hero */}
      <div className="rounded-[20px] bg-card p-5 text-center shadow-[var(--shadow-card,0_8px_24px_rgba(15,33,54,0.06))]">
        <div className="mx-auto flex size-[72px] items-center justify-center rounded-full bg-gradient-to-br from-[#e6f7fb] to-[#d1eef4] font-heading text-2xl font-bold text-[#0e7490]">
          {(perfil.nombre ?? "?").charAt(0).toUpperCase()}
        </div>
        <div className="mt-3 font-heading text-[19px] font-bold">{perfil.nombre ?? "Sin nombre"}</div>
        <div className="mt-0.5 text-sm text-muted-foreground">
          {[edadTexto(perfil), perfil.genero, perfil.grupo_sanguineo && `Grupo ${perfil.grupo_sanguineo}`]
            .filter(Boolean)
            .join(" · ")}
        </div>
        <div className="mt-3.5 flex flex-wrap justify-center gap-2">
          <Chip color="teal">Perfil de salud</Chip>
          <Chip color="violet">{perfil.condiciones.length} condiciones</Chip>
          <Chip color="rose">{perfil.alergias.length} alergias</Chip>
        </div>
      </div>

      {/* vita shortcut */}
      <button
        type="button"
        onClick={() => abrir("Contame qué cambió de tu perfil de salud y lo actualizo.")}
        className="flex items-center gap-3 rounded-[20px] p-3.5 text-left shadow-[inset_0_0_0_1px_rgba(8,145,178,0.15)]"
        style={{ background: "linear-gradient(135deg, rgba(8,145,178,0.08), rgba(14,116,144,0.04))" }}
      >
        <div className="flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-[#22d3ee] to-[#0e7490] text-white">
          <VitaIcon name="sparkle" size={16} />
        </div>
        <div className="flex-1">
          <div className="font-heading text-[14px] font-bold">Actualizar con vita</div>
          <div className="text-xs text-muted-foreground">Contame qué cambió y lo actualizo.</div>
        </div>
        <VitaIcon name="chevron-right" size={18} className="text-primary" />
      </button>

      <Seccion titulo="Datos personales">
        <EditRow label="Nombre" campo="nombre" valor={perfil.nombre ?? ""} />
        <EditRow label="Email" valor={email} soloLectura />
        <EditRow label="Fecha de nacimiento" campo="fecha_nacimiento" valor={perfil.fecha_nacimiento ?? ""} tipo="date" />
        <EditRow label="Género" campo="genero" valor={perfil.genero ?? ""} ultimo />
      </Seccion>

      <Seccion titulo="Medidas">
        <EditRow label="Altura (cm)" campo="altura_cm" valor={perfil.altura_cm?.toString() ?? ""} tipo="number" />
        <EditRow label="Peso (kg)" campo="peso_kg" valor={perfil.peso_kg?.toString() ?? ""} tipo="number" />
        <EditRow label="Grupo sanguíneo" campo="grupo_sanguineo" valor={perfil.grupo_sanguineo ?? ""} ultimo />
      </Seccion>

      <Condiciones condiciones={perfil.condiciones} />
      <Alergias alergias={perfil.alergias} />

      <Seccion titulo="Cobertura médica">
        <EditRow label="Obra social / prepaga" campo="obra_social" valor={perfil.obra_social ?? ""} />
        <EditRow label="N° afiliado" campo="numero_afiliado" valor={perfil.numero_afiliado ?? ""} ultimo />
      </Seccion>

      <Seccion titulo="Contacto de emergencia" subtitulo="Alguien a quien llamar en caso de urgencia">
        <EditRow label="Nombre y relación" campo="contacto_emergencia_nombre" valor={perfil.contacto_emergencia_nombre ?? ""} />
        <EditRow label="Teléfono" campo="contacto_emergencia_telefono" valor={perfil.contacto_emergencia_telefono ?? ""} ultimo />
      </Seccion>
    </div>
  );
}

function edadTexto(perfil: Perfil): string | null {
  if (perfil.fecha_nacimiento) {
    const nacimiento = new Date(perfil.fecha_nacimiento);
    const edad = Math.floor((Date.now() - nacimiento.getTime()) / (365.25 * 24 * 3600 * 1000));
    return `${edad} años`;
  }
  return perfil.edad_rango;
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
    <div>
      <div className="px-1.5 pb-2.5">
        <div className="font-heading text-[15px] font-bold">{titulo}</div>
        {subtitulo && <div className="mt-0.5 text-xs text-muted-foreground">{subtitulo}</div>}
      </div>
      <div className="rounded-[20px] bg-card shadow-[var(--shadow-card,0_8px_24px_rgba(15,33,54,0.06))]">{children}</div>
    </div>
  );
}

function EditRow({
  label,
  campo,
  valor,
  tipo = "text",
  ultimo,
  soloLectura,
}: {
  label: string;
  campo?: "nombre" | "fecha_nacimiento" | "genero" | "grupo_sanguineo" | "altura_cm" | "peso_kg" | "obra_social" | "numero_afiliado" | "contacto_emergencia_nombre" | "contacto_emergencia_telefono";
  valor: string;
  tipo?: "text" | "number" | "date";
  ultimo?: boolean;
  soloLectura?: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const [valorLocal, setValorLocal] = useState(valor);
  const [pendiente, startTransition] = useTransition();

  function guardar() {
    if (!campo) return;
    startTransition(async () => {
      const resultado = await actualizarCampoAction(campo, valorLocal);
      if (resultado.ok) {
        setEditando(false);
      } else {
        // Queda abierto con lo que el usuario escribió — cerrarlo acá
        // haría parecer que se guardó cuando en realidad falló.
        toast.error(resultado.message);
      }
    });
  }

  return (
    <div
      className={`px-4.5 py-3.5 ${ultimo ? "" : "border-b"} ${editando || soloLectura ? "" : "cursor-pointer"}`}
      onClick={() => !editando && !soloLectura && setEditando(true)}
    >
      <div className="text-[11.5px] text-muted-foreground">{label}</div>
      {editando ? (
        <div className="mt-1.5 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <input
            autoFocus
            type={tipo}
            value={valorLocal}
            onChange={(e) => setValorLocal(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && guardar()}
            className="flex-1 rounded-[10px] bg-secondary px-3 py-2 text-sm font-semibold outline-none"
          />
          <button
            type="button"
            onClick={guardar}
            disabled={pendiente}
            className="rounded-full bg-gradient-to-br from-[#22d3ee] to-[#0e7490] px-3.5 py-2 font-heading text-xs font-bold text-white disabled:opacity-60"
          >
            Guardar
          </button>
        </div>
      ) : (
        <div className="mt-0.5 flex items-center justify-between">
          <span className="text-sm font-semibold">{valor || "—"}</span>
          {!soloLectura && <VitaIcon name="edit" size={14} className="text-muted-foreground" />}
        </div>
      )}
    </div>
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
      <div className="flex items-center justify-between px-1.5 pb-2.5">
        <div className="font-heading text-[15px] font-bold">Condiciones</div>
        <button type="button" onClick={() => setAgregando((v) => !v)} className="text-sm font-semibold text-primary">
          + Agregar
        </button>
      </div>
      <div className="rounded-[20px] bg-card shadow-[var(--shadow-card,0_8px_24px_rgba(15,33,54,0.06))]">
        {agregando && (
          <div className="flex gap-2 border-b p-3.5">
            <input
              autoFocus
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && agregar()}
              placeholder="Ej. Hipertensión"
              className="flex-1 rounded-[10px] bg-secondary px-3 py-2 text-sm outline-none"
            />
            <button
              type="button"
              onClick={agregar}
              disabled={pendiente}
              className="rounded-full bg-primary px-3.5 py-2 font-heading text-xs font-bold text-primary-foreground disabled:opacity-60"
            >
              Agregar
            </button>
          </div>
        )}
        {condiciones.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Sin condiciones cargadas.</p>
        ) : (
          condiciones.map((c, i) => (
            <div key={c.label} className={`flex items-center gap-3 p-3.5 ${i < condiciones.length - 1 ? "border-b" : ""}`}>
              <Chip color={colorChipPorIndice(i)}>{c.label}</Chip>
              <div className="flex-1 text-[11.5px] capitalize text-muted-foreground">
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
                <VitaIcon name="close" size={14} className="text-muted-foreground" />
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
      <div className="flex items-center justify-between px-1.5 pb-2.5">
        <div className="font-heading text-[15px] font-bold">Alergias</div>
        <button type="button" onClick={() => setAgregando((v) => !v)} className="text-sm font-semibold text-primary">
          + Agregar
        </button>
      </div>
      <div className="rounded-[20px] bg-card p-3.5 shadow-[var(--shadow-card,0_8px_24px_rgba(15,33,54,0.06))]">
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
                className="flex size-[18px] items-center justify-center rounded-full bg-black/[0.06]"
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
              className="rounded-full bg-secondary px-3 py-1.5 text-[12.5px] outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => setAgregando(true)}
              className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[12.5px] font-semibold text-muted-foreground shadow-[inset_0_0_0_1px_var(--border)]"
            >
              <VitaIcon name="plus" size={12} /> Agregar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
