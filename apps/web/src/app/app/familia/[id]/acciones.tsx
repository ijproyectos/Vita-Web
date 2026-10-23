"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { VitaIcon } from "@/lib/vita-icons";
import { CLASES_COLOR, ETIQUETA_COLOR } from "@/lib/familia/colores";
import { COLORES_PERFIL, type ColorPerfil } from "@/lib/familia/tipos";
import { actualizarMiembroAction, cambiarPerfilActivoAction, dejarDeCuidarAction } from "../actions";

/** Nombre y color de la persona (solo con permiso "editar"). */
export function EditarMiembro({
  elderId,
  nombreInicial,
  colorInicial,
}: {
  elderId: string;
  nombreInicial: string;
  colorInicial: ColorPerfil;
}) {
  const router = useRouter();
  const [nombre, setNombre] = useState(nombreInicial);
  const [color, setColor] = useState<ColorPerfil>(colorInicial);
  const [pendiente, startTransition] = useTransition();
  const cambio = nombre.trim() !== nombreInicial || color !== colorInicial;

  function guardar() {
    startTransition(async () => {
      try {
        const r = await actualizarMiembroAction(elderId, { nombre, color });
        if (r.status === "error") {
          toast.error(r.message);
          return;
        }
        toast.success("Cambios guardados");
        router.refresh();
      } catch {
        toast.error("No pudimos guardar los cambios.");
      }
    });
  }

  return (
    <section className="rounded-[20px] bg-card p-[18px] shadow-card">
      <div className="eyebrow pb-2 text-slate-brand">Nombre</div>
      <div className="rounded-full bg-secondary px-[18px] py-1">
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          maxLength={60}
          aria-label="Nombre"
          className="w-full bg-transparent py-2.5 text-[15px] font-semibold outline-none"
        />
      </div>
      <div className="eyebrow pb-2 pt-4 text-slate-brand">Color</div>
      <div role="radiogroup" aria-label="Color del perfil" className="flex gap-3">
        {COLORES_PERFIL.map((c) => {
          const sel = color === c;
          return (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={sel}
              aria-label={ETIQUETA_COLOR[c]}
              onClick={() => setColor(c)}
              className={cn(
                "size-9 rounded-full ring-offset-2 ring-offset-card transition-shadow",
                CLASES_COLOR[c].solido,
                sel ? `ring-2 ${CLASES_COLOR[c].anillo}` : ""
              )}
            />
          );
        })}
      </div>
      {cambio && (
        <button
          type="button"
          onClick={guardar}
          disabled={pendiente || !nombre.trim()}
          className="mt-4 w-full rounded-full bg-primary py-3 font-heading text-sm font-extrabold text-primary-foreground disabled:opacity-50"
        >
          {pendiente ? "Guardando…" : "Guardar cambios"}
        </button>
      )}
    </section>
  );
}

/**
 * "Ver su rutina" (cambia el perfil activo) o "Dejar de cuidar" (revoca el
 * vínculo propio, con confirmación). Se renderiza dos veces en la pantalla
 * para respetar el orden del diseño (acción arriba, salida al final).
 */
export function AccionesMiembro({
  elderId,
  vinculoId,
  nombre,
  soloVerRutina,
  soloQuitar,
  ultimoCuidador,
}: {
  elderId: string;
  vinculoId: string;
  nombre: string;
  soloVerRutina?: boolean;
  soloQuitar?: boolean;
  /** Nadie más la cuida y no usa su celular: nadie podría volver a abrir ese perfil. */
  ultimoCuidador?: boolean;
}) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [pendiente, startTransition] = useTransition();

  function verRutina() {
    startTransition(async () => {
      try {
        const r = await cambiarPerfilActivoAction(elderId);
        if (r.status === "error") {
          toast.error(r.message);
          return;
        }
        router.push("/app/rutina");
      } catch {
        toast.error("No pudimos cambiar de perfil.");
      }
    });
  }

  function quitar() {
    startTransition(async () => {
      try {
        const r = await dejarDeCuidarAction(vinculoId);
        if (r.status === "error") {
          toast.error(r.message);
          return;
        }
        toast.success(`Listo. Dejaste de cuidar a ${nombre}`);
        router.push("/app/familia");
      } catch {
        toast.error("No pudimos quitarlo de tu familia.");
      }
    });
  }

  if (soloVerRutina) {
    return (
      <button
        type="button"
        onClick={verRutina}
        disabled={pendiente}
        className="flex items-center justify-center gap-2 rounded-full bg-primary py-[14px] font-heading text-sm font-extrabold text-primary-foreground disabled:opacity-60"
      >
        <VitaIcon name="routine" size={16} />
        Ver su rutina
      </button>
    );
  }

  if (!soloQuitar) return null;

  return confirmando ? (
    <div className="rounded-[20px] bg-card p-[18px] shadow-card">
      <div className="font-heading text-[15px] font-extrabold tracking-[-0.02em]">¿Dejar de cuidar a {nombre}?</div>
      <p className="mt-1 text-[12.5px] font-medium leading-[1.45] text-subtle">
        Sale de tu lista y dejás de recibir sus avisos. Los otros cuidadores la siguen viendo.
        {ultimoCuidador &&
          " Hoy sos la única persona que la cuida y todavía no usa su celular: si te vas, nadie va a poder volver a abrir ese perfil."}
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={quitar}
          disabled={pendiente}
          className="flex-1 rounded-full bg-destructive py-3 font-heading text-[13.5px] font-extrabold text-primary-foreground disabled:opacity-60"
        >
          {pendiente ? "Quitando…" : "Dejar de cuidar"}
        </button>
        <button
          type="button"
          onClick={() => setConfirmando(false)}
          disabled={pendiente}
          className="flex-1 rounded-full bg-secondary py-3 font-heading text-[13.5px] font-extrabold"
        >
          Cancelar
        </button>
      </div>
    </div>
  ) : (
    <button
      type="button"
      onClick={() => setConfirmando(true)}
      className="py-2 text-center text-[13.5px] font-bold text-destructive"
    >
      Dejar de cuidar a {nombre}
    </button>
  );
}
