"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { VitaIcon } from "@/lib/vita-icons";
import { cn } from "@/lib/utils";
import { guardarMedicionSimpleAction } from "@/lib/modo-simple/actions";
import type { TipoMedirSimple } from "@/lib/modo-simple/medir";
import { agregarTecla, aNumero } from "@/lib/modo-simple/teclado";

// Cargar una medición SIN salir del modo simple (diseño "Vita Modo Simple v2":
// "¿Cuánto te dio la presión?", casillas grandes y teclado numérico grande).
// Se guarda con la fecha y hora de ahora. La validación real la hace el
// servidor (`validarMedicion`); acá solo se arma el número.

type Config = { titulo: string; unidad: string; decimales: boolean; maxEnteros: number; dos: boolean };

const CONFIG: Record<TipoMedirSimple, Config> = {
  presion: { titulo: "¿Cuánto te dio la presión?", unidad: "mmHg", decimales: false, maxEnteros: 3, dos: true },
  glucemia: { titulo: "¿Cuánto te dio el azúcar?", unidad: "mg/dl", decimales: false, maxEnteros: 3, dos: false },
  peso: { titulo: "¿Cuánto pesás hoy?", unidad: "kg", decimales: true, maxEnteros: 3, dos: false },
  temperatura: { titulo: "¿Cuánta temperatura tenés?", unidad: "°C", decimales: true, maxEnteros: 2, dos: false },
};

export function TecladoMedicion({
  tipo,
  ultimo,
  onCerrar,
}: {
  tipo: TipoMedirSimple;
  /** Última anotada ("135/85"), para mostrar de referencia. */
  ultimo?: string | null;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const cfg = CONFIG[tipo];
  const [valores, setValores] = useState<[string, string]>(["", ""]);
  const [campo, setCampo] = useState<0 | 1>(0);
  const [error, setError] = useState<string | null>(null);
  const [guardando, startGuardar] = useTransition();

  const principal = aNumero(valores[0]);
  const secundario = aNumero(valores[1]);
  const listo = principal !== null && (!cfg.dos || secundario !== null) && !guardando;

  function tocar(tecla: string) {
    setError(null);
    const nuevo: [string, string] = [...valores];
    nuevo[campo] = agregarTecla(valores[campo], tecla, cfg);
    setValores(nuevo);
    // Presión: con los 3 números de arriba pasa sola a la de abajo.
    if (cfg.dos && campo === 0 && nuevo[0].length >= cfg.maxEnteros) setCampo(1);
  }

  function borrar() {
    setError(null);
    const nuevo: [string, string] = [...valores];
    if (nuevo[campo] === "" && cfg.dos && campo === 1) {
      setCampo(0);
      nuevo[0] = nuevo[0].slice(0, -1);
    } else nuevo[campo] = nuevo[campo].slice(0, -1);
    setValores(nuevo);
  }

  function guardar() {
    if (principal === null) return;
    startGuardar(async () => {
      const r = await guardarMedicionSimpleAction({ tipo, valor: principal, valorSecundario: cfg.dos ? secundario : null }).catch(() => ({
        status: "error" as const,
        message: "No pudimos anotarlo. Probá de nuevo.",
      }));
      if (r.status === "success") {
        toast.success("Listo, lo anoté.");
        onCerrar();
        router.refresh();
      } else setError(r.message);
    });
  }

  const casilla = (i: 0 | 1, etiqueta: string | null) => (
    <button
      type="button"
      onClick={() => setCampo(i)}
      aria-label={etiqueta ?? cfg.titulo}
      aria-pressed={campo === i}
      className={cn(
        "flex min-h-[96px] flex-1 flex-col items-center justify-center gap-1 rounded-[22px] bg-card px-3 py-3 shadow-item",
        campo === i && "ring-[3px] ring-primary"
      )}
    >
      {etiqueta && <span className="text-[16px] font-bold text-slate-brand">{etiqueta}</span>}
      <span className="font-heading text-[42px] font-extrabold leading-none tracking-[-0.03em] tabular-nums">
        {valores[i] || <span className="text-faint">—</span>}
      </span>
    </button>
  );

  const teclas = ["1", "2", "3", "4", "5", "6", "7", "8", "9", cfg.decimales ? "," : "", "0"];

  return (
    <div role="dialog" aria-modal="true" aria-label={cfg.titulo} className="fixed inset-0 z-50 flex flex-col bg-cream px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))]">
      <button type="button" onClick={onCerrar} className="flex h-12 items-center gap-1.5 self-start text-[18px] font-bold text-slate-brand">
        <VitaIcon name="chevron-left" size={22} />
        Volver
      </button>

      <h1 className="mt-3 font-heading text-[28px] font-extrabold leading-tight tracking-[-0.03em]">{cfg.titulo}</h1>
      {ultimo && <p className="mt-1 text-[16px] font-semibold text-subtle">La última vez: {ultimo} {cfg.unidad}</p>}

      <div className="mt-4 flex gap-3">
        {cfg.dos ? (
          <>
            {casilla(0, "Máxima")}
            {casilla(1, "Mínima")}
          </>
        ) : (
          casilla(0, null)
        )}
      </div>
      <p className="mt-2 px-1 text-[16px] font-semibold text-slate-brand">
        {cfg.dos ? "Primero el número de arriba." : cfg.unidad}
      </p>

      <div className="mt-3 grid grid-cols-3 gap-2.5">
        {teclas.map((t, i) =>
          t ? (
            <button
              key={i}
              type="button"
              onClick={() => tocar(t)}
              className="h-[60px] rounded-[18px] bg-card font-heading text-[28px] font-extrabold shadow-item active:bg-secondary"
            >
              {t}
            </button>
          ) : (
            <span key={i} />
          )
        )}
        <button type="button" onClick={borrar} aria-label="Borrar" className="h-[60px] rounded-[18px] bg-secondary text-[20px] font-extrabold text-slate-brand">
          Borrar
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-[16px] bg-destructive/10 px-4 py-3 text-[16px] font-semibold text-destructive">
          {error}
        </p>
      )}

      <div className="mt-auto pt-4">
        <button
          type="button"
          onClick={guardar}
          disabled={!listo}
          className="h-[64px] w-full rounded-full bg-primary text-[21px] font-extrabold text-primary-foreground shadow-cta disabled:bg-faint disabled:shadow-none"
        >
          {guardando ? "Anotando…" : "Listo"}
        </button>
      </div>
    </div>
  );
}
