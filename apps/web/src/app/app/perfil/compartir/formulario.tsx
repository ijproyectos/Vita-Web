"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { VitaIcon } from "@/lib/vita-icons";
import { cn } from "@/lib/utils";
import { DURACIONES, DURACION_DEFAULT, ETIQUETA_MAX, type DuracionEnlace } from "@/lib/compartir/tipos";
import { crearEnlaceAction, type EstadoCrearEnlace } from "./actions";

const ESTADO_INICIAL: EstadoCrearEnlace = { status: "idle" };

function fechaLarga(iso: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date(iso));
}

// Form de creación + tarjeta con el link recién creado. La URL completa
// (con el token crudo) solo existe en el estado de esta action: no se
// guarda en ningún lado y no se puede volver a mostrar después.
export function FormularioCompartir() {
  const [etiqueta, setEtiqueta] = useState("");
  const [duracion, setDuracion] = useState<DuracionEnlace>(DURACION_DEFAULT);
  const [copiado, setCopiado] = useState(false);

  async function accion(prev: EstadoCrearEnlace, formData: FormData): Promise<EstadoCrearEnlace> {
    const resultado = await crearEnlaceAction(prev, formData);
    if (resultado.status === "success") {
      setEtiqueta("");
      setCopiado(false);
    }
    return resultado;
  }

  const [estado, formAction, pendiente] = useActionState(accion, ESTADO_INICIAL);

  function copiar(url: string) {
    navigator.clipboard.writeText(url).then(
      () => {
        setCopiado(true);
        toast.success("Link copiado");
        setTimeout(() => setCopiado(false), 2000);
      },
      () => toast.error("No se pudo copiar el link")
    );
  }

  async function compartir(url: string) {
    try {
      await navigator.share({ title: "Mi resumen de salud", text: "Mi resumen de salud en vita.", url });
    } catch {
      // El usuario canceló el diálogo de compartir: no es un error.
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} className="flex flex-col gap-3 rounded-[20px] bg-card p-4 shadow-card">
        <div className="font-heading text-[15px] font-bold">Crear un link nuevo</div>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-muted-foreground">Para quién es (opcional)</span>
          <input
            name="etiqueta"
            value={etiqueta}
            onChange={(e) => setEtiqueta(e.target.value)}
            maxLength={ETIQUETA_MAX}
            placeholder="Ej: Dra. Pérez"
            className="rounded-[20px] bg-secondary px-3.5 py-3 text-sm font-medium outline-none"
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-muted-foreground">¿Cuánto tiempo va a estar disponible?</span>
          <input type="hidden" name="duracion" value={duracion} />
          <div className="flex gap-2" role="radiogroup" aria-label="Duración del link">
            {DURACIONES.map((d) => (
              <button
                key={d.valor}
                type="button"
                role="radio"
                aria-checked={duracion === d.valor}
                onClick={() => setDuracion(d.valor)}
                className={cn(
                  "flex-1 rounded-full px-3 py-2.5 text-sm font-semibold",
                  duracion === d.valor ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
                )}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <button
          type="submit"
          disabled={pendiente}
          className="flex h-12 items-center justify-center gap-2 rounded-full bg-primary font-heading text-[15px] font-bold text-primary-foreground disabled:opacity-50"
        >
          <VitaIcon name="link" size={18} />
          {pendiente ? "Creando…" : "Crear link"}
        </button>

        {estado.status === "error" && (
          <p className="rounded-[14px] bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">{estado.message}</p>
        )}
      </form>

      {estado.status === "success" && (
        <div className="flex flex-col gap-3 rounded-[20px] bg-card p-4 shadow-card">
          <div className="font-heading text-[15px] font-bold">Tu link está listo</div>
          <div className="break-all rounded-[14px] bg-secondary px-3.5 py-3 text-[13px] font-medium">{estado.url}</div>
          <div className="text-xs text-muted-foreground">Disponible hasta el {fechaLarga(estado.expiraAt)}.</div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => copiar(estado.url)}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-primary font-heading text-sm font-bold text-primary-foreground"
            >
              <VitaIcon name={copiado ? "check" : "copy"} size={16} />
              {copiado ? "Copiado" : "Copiar link"}
            </button>
            {typeof navigator !== "undefined" && typeof navigator.share === "function" && (
              <button
                type="button"
                onClick={() => compartir(estado.url)}
                className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-secondary font-heading text-sm font-bold text-secondary-foreground"
              >
                <VitaIcon name="upload" size={16} />
                Compartir
              </button>
            )}
          </div>
          <p className="rounded-[14px] bg-chip-amber-bg px-3.5 py-2.5 text-[12.5px] leading-snug text-chip-amber-ink">
            Cualquiera con este link puede ver tu resumen hasta que venza. Podés revocarlo cuando quieras.
          </p>
          <p className="text-[11.5px] text-muted-foreground">
            Guardá o enviá el link ahora: por seguridad no lo volvemos a mostrar.
          </p>
        </div>
      )}
    </div>
  );
}
