"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { guardarContactoEmergenciaAction } from "./actions";

const RELACIONES = ["Hermana", "Hermano", "Pareja", "Mamá", "Papá", "Hijo/a", "Amiga/o", "Otro"];

const CLASE_INPUT =
  "h-[52px] w-full rounded-full bg-card px-[18px] text-[14.5px] font-semibold shadow-item outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

export function FormularioContacto({
  inicial,
  conRelacion,
  soloLectura,
}: {
  inicial: { nombre: string; relacion: string; telefono: string };
  /** false mientras la migración 025 no esté aplicada: se ocultan los chips. */
  conRelacion: boolean;
  soloLectura: boolean;
}) {
  const router = useRouter();
  const [nombre, setNombre] = useState(inicial.nombre);
  const [relacion, setRelacion] = useState(inicial.relacion);
  const [telefono, setTelefono] = useState(inicial.telefono);
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!nombre.trim() || !telefono.trim()) {
      setError("Completá nombre y teléfono.");
      return;
    }
    startTransition(async () => {
      const r = await guardarContactoEmergenciaAction({ nombre, relacion: relacion || "Otro", telefono });
      if (r.ok) {
        toast.success("Contacto de emergencia guardado");
        router.push("/app/perfil");
      } else setError(r.message);
    });
  }

  function quitar() {
    setError(null);
    startTransition(async () => {
      const r = await guardarContactoEmergenciaAction({ nombre: "", relacion: "", telefono: "" });
      if (r.ok) {
        setNombre("");
        setRelacion("");
        setTelefono("");
        toast.success("Contacto quitado");
      } else setError(r.message);
    });
  }

  return (
    <form onSubmit={guardar} className="flex flex-col gap-5">
      <fieldset disabled={soloLectura} className="flex flex-col gap-5">
        <label className="flex flex-col gap-[7px]">
          <span className="eyebrow pl-1 text-subtle">Nombre</span>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre y apellido" className={CLASE_INPUT} />
        </label>

        {conRelacion && (
          <div className="flex flex-col gap-2.5">
            <div className="eyebrow pl-1 text-subtle">Es tu…</div>
            <div className="flex flex-wrap gap-[7px]" role="radiogroup" aria-label="Relación">
              {RELACIONES.map((r) => {
                const activa = relacion === r;
                return (
                  <button
                    key={r}
                    type="button"
                    role="radio"
                    aria-checked={activa}
                    onClick={() => setRelacion(r)}
                    className={cn(
                      "rounded-full px-[15px] py-2.5 text-[13.5px] font-bold transition-all motion-reduce:transition-none",
                      activa ? "bg-primary text-primary-foreground shadow-cta" : "bg-card text-foreground shadow-item"
                    )}
                  >
                    {r}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <label className="flex flex-col gap-[7px]">
          <span className="eyebrow pl-1 text-subtle">Teléfono</span>
          <input
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            placeholder="+54 9 11 …"
            inputMode="tel"
            className={cn(CLASE_INPUT, "tabular-nums")}
          />
        </label>

        {error && <p className="rounded-[14px] bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">{error}</p>}

        <button
          type="submit"
          disabled={pendiente}
          className="mt-1.5 h-[54px] rounded-full bg-primary font-heading text-base font-extrabold text-primary-foreground shadow-cta disabled:opacity-60"
        >
          {pendiente ? "Guardando…" : "Guardar"}
        </button>
        {(inicial.nombre || inicial.telefono) && (
          <button type="button" onClick={quitar} disabled={pendiente} className="text-sm font-bold text-destructive disabled:opacity-60">
            Quitar contacto
          </button>
        )}
      </fieldset>
    </form>
  );
}
