"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CLASES_COLOR, ETIQUETA_COLOR } from "@/lib/familia/colores";
import { COLORES_PERFIL, RELACIONES_SUGERIDAS, type ColorPerfil } from "@/lib/familia/tipos";
import { CONDICIONES } from "@/lib/onboarding/catalogo-condiciones";
import { crearPerfilGestionadoAction, type EstadoCrearPerfil } from "../actions";

const ESTADO_INICIAL: EstadoCrearPerfil = { status: "idle" };

// Solo condiciones reales del catálogo (sin "Otra"/"Ninguna": acá es opcional).
const CONDICIONES_ELEGIBLES = CONDICIONES.filter((c) => c.id !== "otra" && c.id !== "ninguna");

// "Crear un perfil" (perfil gestionado): alguien sin celular que llevás desde
// tu app. Todos los campos son controlados (regla del repo para <form action>).
export function FormularioNuevoPerfil() {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [relacion, setRelacion] = useState("");
  const [color, setColor] = useState<ColorPerfil>("violeta");
  const [anio, setAnio] = useState("");
  const [condiciones, setCondiciones] = useState<string[]>([]);

  async function accion(prev: EstadoCrearPerfil, formData: FormData): Promise<EstadoCrearPerfil> {
    const resultado = await crearPerfilGestionadoAction(prev, formData);
    if (resultado.status === "success") {
      toast.success(`Listo. Ya podés cargar los remedios de ${nombre.trim()}`);
      router.replace("/app/rutina");
    } else if (resultado.status === "error") {
      toast.error(resultado.message);
    }
    return resultado;
  }

  const [estado, formAction, pendiente] = useActionState(accion, ESTADO_INICIAL);

  function alternarCondicion(id: string) {
    setCondiciones((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  }

  return (
    <form action={formAction} className="flex flex-col gap-[22px] pb-10">
      <div>
        <Etiqueta texto="Nombre" requerido />
        <div className="rounded-full bg-card px-[18px] py-1 shadow-item">
          <input
            name="nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Elsa"
            maxLength={60}
            autoComplete="off"
            className="w-full bg-transparent py-3 text-[15px] font-semibold outline-none placeholder:font-medium placeholder:text-faint"
          />
        </div>
      </div>

      <div>
        <Etiqueta texto="¿Qué es tuyo?" />
        <div className="flex flex-wrap gap-2">
          {RELACIONES_SUGERIDAS.map((r) => {
            const sel = relacion === r;
            return (
              <button
                key={r}
                type="button"
                aria-pressed={sel}
                onClick={() => setRelacion(sel ? "" : r)}
                className={cn(
                  "rounded-full px-4 py-2.5 text-[13px] font-bold transition-colors motion-reduce:transition-none",
                  sel ? "bg-primary text-primary-foreground" : "bg-card text-foreground shadow-item"
                )}
              >
                {r}
              </button>
            );
          })}
        </div>
        <input type="hidden" name="relacion" value={relacion} />
      </div>

      <div>
        <Etiqueta texto="Color" />
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
                  "size-10 rounded-full ring-offset-2 ring-offset-background transition-shadow",
                  CLASES_COLOR[c].solido,
                  sel ? `ring-2 ${CLASES_COLOR[c].anillo}` : ""
                )}
              />
            );
          })}
        </div>
        <input type="hidden" name="color" value={color} />
      </div>

      <div>
        <Etiqueta texto="Año de nacimiento (opcional)" />
        <div className="w-40 rounded-full bg-card px-[18px] py-1 shadow-item">
          <input
            name="anioNacimiento"
            value={anio}
            onChange={(e) => setAnio(e.target.value.replace(/\D/g, "").slice(0, 4))}
            inputMode="numeric"
            placeholder="1945"
            className="w-full bg-transparent py-3 text-[15px] font-semibold tabular-nums outline-none placeholder:font-medium placeholder:text-faint"
          />
        </div>
      </div>

      <div>
        <Etiqueta texto="Condiciones (opcional)" />
        <div className="flex flex-wrap gap-2">
          {CONDICIONES_ELEGIBLES.map((c) => {
            const sel = condiciones.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={sel}
                onClick={() => alternarCondicion(c.id)}
                className={cn(
                  "rounded-full px-4 py-2.5 text-[13px] font-bold transition-colors motion-reduce:transition-none",
                  sel ? "bg-primary text-primary-foreground" : "bg-card text-foreground shadow-item"
                )}
              >
                {c.label}
              </button>
            );
          })}
        </div>
        {condiciones.map((id) => (
          <input key={id} type="hidden" name="condiciones" value={id} />
        ))}
      </div>

      <p className="text-[12px] font-medium leading-[1.45] text-subtle">
        El perfil queda a tu cargo: vos cargás sus remedios y turnos. Si más adelante quiere usar su propio celular, le
        generás un código desde Familia.
      </p>

      {estado.status === "error" && (
        <p role="alert" className="text-[13px] font-semibold text-destructive">
          {estado.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pendiente || !nombre.trim()}
        className="rounded-full bg-primary py-[15px] font-heading text-sm font-extrabold text-primary-foreground disabled:opacity-50"
      >
        {pendiente ? "Creando…" : "Crear perfil"}
      </button>
    </form>
  );
}

function Etiqueta({ texto, requerido }: { texto: string; requerido?: boolean }) {
  return (
    <div className="eyebrow px-1 pb-2 text-slate-brand">
      {texto}
      {requerido && <span className="text-primary"> *</span>}
    </div>
  );
}
