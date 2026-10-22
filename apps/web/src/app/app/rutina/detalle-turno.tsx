"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { VitaIcon } from "@/lib/vita-icons";
import { cn } from "@/lib/utils";
import { fechaConOffset, formatoFechaCorta } from "@/lib/rutina/formato";
import { iconoDeEspecialidad } from "@/lib/turnos/icono";
import {
  MAX_ITEMS_LLEVAR,
  normalizarLlevar,
  type ItemLlevar,
  type Turno,
} from "@/lib/turnos/tipos";
import type { PerfilActivo } from "@/lib/familia/tipos";
import { guardarLlevarAction } from "./actions";
import { CLASE_BOTON_SECUNDARIO, Dato, Hoja, SeccionHoja } from "./hoja";

// Hoja "Detalle turno" (V7 D:2891): día y hora, dónde (con "Cómo llegar"),
// checklist "Qué llevar" y las acciones. Dirección, teléfono y checklist
// viven en columnas de la migración 023: sin ella esas partes se ocultan.

function nombreDelDia(fecha: string): string {
  if (fecha === fechaConOffset(0)) return "Hoy";
  if (fecha === fechaConOffset(1)) return "Mañana";
  const nombre = new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    timeZone: "UTC",
  }).format(new Date(`${fecha}T12:00:00Z`));
  return nombre.charAt(0).toUpperCase() + nombre.slice(1);
}

export function DetalleTurno({
  turno,
  perfil,
  puedeEditar,
  onEditar,
  onCerrar,
}: {
  turno: Turno;
  perfil: PerfilActivo;
  puedeEditar: boolean;
  /** Si se pasa, "Editar" lo llama en vez de navegar a la lista. */
  onEditar?: () => void;
  onCerrar: () => void;
}) {
  const [items, setItems] = useState<ItemLlevar[]>(() =>
    normalizarLlevar(turno.llevar),
  );
  const [borrador, setBorrador] = useState("");
  const [guardando, startGuardar] = useTransition();
  // `llevar` llega undefined si la migración 023 no está aplicada.
  const llevarDisponible = turno.llevar !== undefined;

  const lugar = turno.lugar?.trim() || null;
  const direccion = turno.direccion?.trim() || null;
  const telefono = turno.telefono?.trim() || null;
  const destinoMapa = direccion ?? lugar;

  function persistir(siguiente: ItemLlevar[]) {
    const anterior = items;
    setItems(siguiente);
    startGuardar(async () => {
      try {
        const r = await guardarLlevarAction(turno.id, siguiente);
        if (r.status === "error") {
          setItems(anterior);
          toast.error(r.message);
        }
      } catch {
        setItems(anterior);
        toast.error("No pudimos guardar la lista.");
      }
    });
  }

  function agregar() {
    const t = borrador.trim().slice(0, 80);
    if (!t || items.length >= MAX_ITEMS_LLEVAR) return;
    persistir([...items, { t, ok: false }]);
    setBorrador("");
  }

  return (
    <Hoja
      abierto
      onCerrar={onCerrar}
      icono={
        <VitaIcon name={iconoDeEspecialidad(turno.especialidad)} size={26} />
      }
      tileClassName="bg-persona-1-tint text-persona-1-deep"
      eyebrow={
        perfil.esPropio ? "Tu turno" : `Turno de ${perfil.nombre.split(" ")[0]}`
      }
      eyebrowClassName="text-primary"
      titulo={turno.especialidad}
      subtitulo={turno.profesional?.trim() || "Sin profesional cargado"}
    >
      <div className="grid grid-cols-2 gap-2">
        <Dato
          label="Día"
          valor={nombreDelDia(turno.fecha)}
          sub={formatoFechaCorta(turno.fecha)}
        />
        <Dato
          label="Hora"
          valor={`${turno.hora} hs`}
          sub="Aviso 2 horas antes"
        />
      </div>

      <SeccionHoja titulo="Dónde">
        <div className="flex items-center gap-3 rounded-[20px] bg-card px-4 py-[15px] shadow-card">
          <div className="min-w-0 flex-1">
            <div className="font-heading text-[14.5px] font-extrabold tracking-[-0.02em]">
              {lugar ?? "Sin lugar cargado"}
            </div>
            <div className="mt-0.5 text-[11.5px] font-medium text-subtle">
              {direccion ?? "Sin dirección cargada"}
            </div>
          </div>
          {destinoMapa && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destinoMapa)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-[38px] shrink-0 items-center gap-1.5 rounded-full bg-persona-1-tint px-3.5 text-[12.5px] font-extrabold text-teal-deep"
            >
              <VitaIcon name="navigation" size={14} strokeWidth={2.4} />
              Cómo llegar
            </a>
          )}
        </div>
      </SeccionHoja>

      {llevarDisponible && (
        <SeccionHoja titulo="Qué llevar">
          <div className="overflow-hidden rounded-[20px] bg-card shadow-card">
            {items.map((it, i) => (
              <div
                key={`${it.t}-${i}`}
                className="flex items-center gap-3 border-b border-foreground/5 py-[11px] pl-4 pr-2"
              >
                <button
                  type="button"
                  disabled={!puedeEditar || guardando}
                  onClick={() =>
                    persistir(
                      items.map((x, j) => (j === i ? { ...x, ok: !x.ok } : x)),
                    )
                  }
                  aria-pressed={it.ok}
                  aria-label={
                    it.ok ? `Desmarcar ${it.t}` : `Marcar ${it.t} como listo`
                  }
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded-full text-primary-foreground",
                    it.ok ? "bg-primary" : "bg-primary/25",
                  )}
                >
                  {it.ok && (
                    <VitaIcon name="check" size={10} strokeWidth={3.4} />
                  )}
                </button>
                <span
                  className={cn(
                    "min-w-0 flex-1 text-[13.5px] font-semibold leading-snug",
                    it.ok && "text-subtle line-through",
                  )}
                >
                  {it.t}
                </span>
                {puedeEditar && (
                  <button
                    type="button"
                    disabled={guardando}
                    onClick={() => persistir(items.filter((_, j) => j !== i))}
                    aria-label={`Quitar ${it.t}`}
                    className="flex size-8 shrink-0 items-center justify-center rounded-full text-faint hover:text-destructive"
                  >
                    <VitaIcon name="close" size={14} strokeWidth={2.4} />
                  </button>
                )}
              </div>
            ))}
            {items.length === 0 && !puedeEditar && (
              <div className="px-4 py-3.5 text-[13px] font-medium text-subtle">
                Nada cargado todavía.
              </div>
            )}
            {puedeEditar && (
              <div className="flex items-center gap-2 py-1.5 pl-4 pr-2">
                <input
                  value={borrador}
                  onChange={(e) => setBorrador(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      agregar();
                    }
                  }}
                  maxLength={80}
                  placeholder={
                    items.length === 0
                      ? "Ej.: DNI, credencial, estudios"
                      : "Agregar algo más"
                  }
                  className="min-w-0 flex-1 bg-transparent py-2 text-[13.5px] font-semibold outline-none placeholder:text-faint"
                />
                <button
                  type="button"
                  onClick={agregar}
                  disabled={!borrador.trim() || guardando}
                  aria-label="Agregar"
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full text-primary-foreground",
                    borrador.trim() ? "bg-primary" : "bg-deshabilitado",
                  )}
                >
                  <VitaIcon name="plus" size={15} strokeWidth={2.6} />
                </button>
              </div>
            )}
          </div>
        </SeccionHoja>
      )}

      <div className="flex gap-2">
        {telefono ? (
          <a
            href={`tel:${telefono.replace(/[^\d+]/g, "")}`}
            className="flex-1 rounded-full bg-primary py-3.5 text-center text-sm font-extrabold text-primary-foreground shadow-cta"
          >
            Llamar al consultorio
          </a>
        ) : (
          <button
            type="button"
            disabled
            title="Todavía no cargaste el teléfono"
            className="flex-1 rounded-full bg-deshabilitado py-3.5 text-sm font-extrabold text-primary-foreground"
          >
            Llamar al consultorio
          </button>
        )}
        {puedeEditar &&
          (onEditar ? (
            <button
              type="button"
              onClick={onEditar}
              className={CLASE_BOTON_SECUNDARIO}
            >
              Editar
            </button>
          ) : (
            <Link
              href={`/app/turnos?editar=${turno.id}`}
              className={CLASE_BOTON_SECUNDARIO}
            >
              Editar
            </Link>
          ))}
      </div>
      {!telefono && (
        <div className="-mt-2 px-1 text-center text-[11.5px] font-medium text-subtle">
          Sin teléfono cargado.
        </div>
      )}
    </Hoja>
  );
}
