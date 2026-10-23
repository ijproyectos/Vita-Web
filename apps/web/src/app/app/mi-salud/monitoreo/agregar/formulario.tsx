"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { useVolver } from "@/lib/navegacion/rastreador";
import { toast } from "sonner";
import { VitaIcon } from "@/lib/vita-icons";
import { cn } from "@/lib/utils";
import type { EstadoAccion } from "../../../rutina/actions";
import { crearMedicionAction } from "../actions";
import {
  AVISO_REFERENCIA,
  CONTEXTOS_GLUCEMIA,
  ETIQUETA_CONTEXTO,
  META_MEDICION,
  TIPOS_MEDICION,
  dentroDeRango,
  esTipoMedicion,
  parsearNumero,
  type ContextoGlucemia,
  type TipoMedicion,
} from "@/lib/mediciones/tipos";

const ESTADO_INICIAL: EstadoAccion = { status: "idle" };

const CLASE_INPUT_VALOR =
  "w-24 rounded-[var(--radius-item)] bg-secondary py-2.5 text-center font-heading text-[38px] font-bold tracking-[-0.04em] tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

export function FormularioMedicion({ tipoInicial, volver }: { tipoInicial: string; volver: string }) {
  const router = useRouter();
  const volverAtras = useVolver(volver);
  const [tipo, setTipo] = useState<TipoMedicion>(esTipoMedicion(tipoInicial) ? tipoInicial : "presion");
  const [valor, setValor] = useState("");
  const [secundario, setSecundario] = useState("");
  const [pulso, setPulso] = useState("");
  const [contexto, setContexto] = useState<ContextoGlucemia | "">("");
  const [fecha, setFecha] = useState("");
  const [hora, setHora] = useState("");
  const [notas, setNotas] = useState("");

  async function accion(prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
    const resultado = await crearMedicionAction(prev, formData);
    if (resultado.status === "success") {
      toast.success("Medición guardada");
      router.replace(volver);
    }
    return resultado;
  }
  const [estado, formAction, pendiente] = useActionState(accion, ESTADO_INICIAL);

  const meta = META_MEDICION[tipo];
  const esPresion = tipo === "presion";
  const num = parsearNumero(valor);
  const sec = parsearNumero(secundario);

  const faltantes = [
    num === null && (esPresion ? "la máxima" : "el valor"),
    esPresion && sec === null && "la mínima",
  ].filter(Boolean) as string[];
  const puedeGuardar = faltantes.length === 0;

  // Pista informativa, derivada solo de lo que se escribió (y del rango orientativo).
  let pista = meta.rango?.texto ?? "Lo guardo tal cual lo cargues. Si lo medís seguido, armo el gráfico.";
  let colorPista = "bg-border";
  if (num !== null && meta.rango) {
    const dentro = dentroDeRango({ tipo, valor: num, contexto: contexto || null });
    if (dentro === true) {
      pista = `Este valor queda dentro del rango orientativo (${meta.rango.min}–${meta.rango.max} ${meta.unidad}).`;
      colorPista = "bg-primary";
    } else if (dentro === false) {
      pista = `Este valor queda fuera del rango orientativo (${meta.rango.min}–${meta.rango.max} ${meta.unidad}). Si te preocupa, consultalo con tu médico.`;
      colorPista = "bg-aviso";
    }
  }

  return (
    <form action={formAction} className="flex flex-col gap-[22px] pb-24">
      <div>
        <Etiqueta text="Métrica" />
        <div className="flex flex-wrap gap-2">
          {TIPOS_MEDICION.map((t) => {
            const sel = tipo === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setTipo(t);
                  setValor("");
                  setSecundario("");
                  setPulso("");
                  setContexto("");
                }}
                aria-pressed={sel}
                className={cn(
                  "inline-flex items-center gap-[7px] rounded-full px-4 py-[11px] text-[13.5px] font-bold transition-all motion-reduce:transition-none",
                  sel
                    ? "bg-primary text-primary-foreground shadow-cta"
                    : "bg-card text-slate-brand shadow-item"
                )}
              >
                <VitaIcon name={META_MEDICION[t].icono} size={16} />
                {META_MEDICION[t].nombre}
              </button>
            );
          })}
        </div>
        <input type="hidden" name="tipo" value={tipo} />
      </div>

      <div>
        <Etiqueta text="Valor" requerido />
        <div className="mt-0 flex items-center justify-center gap-2.5 rounded-[20px] bg-card p-[22px] shadow-item">
          <input
            name="valor"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            inputMode="decimal"
            autoComplete="off"
            aria-label={esPresion ? "Presión máxima (sistólica)" : meta.nombre}
            placeholder="—"
            className={CLASE_INPUT_VALOR}
          />
          {esPresion && (
            <>
              <span className="text-[30px] font-bold text-faint">/</span>
              <input
                name="valorSecundario"
                value={secundario}
                onChange={(e) => setSecundario(e.target.value)}
                inputMode="decimal"
                autoComplete="off"
                aria-label="Presión mínima (diastólica)"
                placeholder="—"
                className={CLASE_INPUT_VALOR}
              />
            </>
          )}
          <span className="self-end pb-3.5 text-[13px] font-bold text-subtle">{meta.unidad}</span>
        </div>
        {esPresion && (
          <p className="mt-2 text-center text-xs font-medium text-subtle">Máxima (arriba) / mínima (abajo)</p>
        )}
        <div className="mt-4 flex items-start gap-[11px]">
          <div className={cn("min-h-[34px] w-[3px] self-stretch rounded-[3px]", colorPista)} />
          <div className="text-[12.5px] font-medium leading-normal text-slate-brand">
            {pista}
            {meta.rango && <span className="mt-0.5 block text-subtle">{AVISO_REFERENCIA}</span>}
          </div>
        </div>
      </div>

      {esPresion && (
        <div>
          <Etiqueta text="Pulso (opcional)" />
          <div className="flex items-center gap-2.5 rounded-full bg-card px-[18px] py-1 shadow-item">
            <VitaIcon name="heart-plus" size={16} className="text-muted-foreground" />
            <input
              name="pulso"
              value={pulso}
              onChange={(e) => setPulso(e.target.value)}
              inputMode="numeric"
              autoComplete="off"
              placeholder="72"
              className="w-full bg-transparent py-3 text-[15px] font-semibold outline-none placeholder:font-medium placeholder:text-faint"
            />
            <span className="text-xs font-bold text-subtle">lpm</span>
          </div>
        </div>
      )}

      {tipo === "glucemia" && (
        <div>
          <Etiqueta text="Momento" />
          <div className="flex gap-2">
            {CONTEXTOS_GLUCEMIA.map((c) => {
              const sel = contexto === c;
              return (
                <button
                  key={c}
                  type="button"
                  aria-pressed={sel}
                  onClick={() => setContexto(sel ? "" : c)}
                  className={cn(
                    "flex-1 rounded-[14px] px-1 py-3 text-[12.5px] font-bold transition-all motion-reduce:transition-none",
                    sel
                      ? "bg-primary text-primary-foreground shadow-cta"
                      : "bg-card text-slate-brand shadow-item"
                  )}
                >
                  {ETIQUETA_CONTEXTO[c]}
                </button>
              );
            })}
          </div>
          <input type="hidden" name="contexto" value={contexto} />
        </div>
      )}

      <div>
        <Etiqueta text="Cuándo (opcional)" />
        <div className="flex items-start gap-3">
          <div className="flex flex-1 items-center gap-2 rounded-[var(--radius-item)] bg-card px-3.5 py-3.5 shadow-item">
            <VitaIcon name="routine" size={16} color="var(--primary)" />
            <input
              name="fecha"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              aria-label="Fecha de la medición"
              className="w-full bg-transparent text-sm font-semibold outline-none"
            />
          </div>
          <div className="flex flex-1 items-center gap-2 rounded-[var(--radius-item)] bg-card px-3.5 py-3.5 shadow-item">
            <VitaIcon name="clock" size={16} color="var(--primary)" />
            <input
              name="hora"
              type="time"
              value={hora}
              onChange={(e) => setHora(e.target.value)}
              aria-label="Hora de la medición"
              className="w-full bg-transparent text-sm font-semibold outline-none"
            />
          </div>
        </div>
        <p className="mt-2 text-xs font-medium text-subtle">Si lo dejás vacío, se guarda con la fecha y hora de ahora.</p>
      </div>

      <div>
        <Etiqueta text="Notas (opcional)" />
        <textarea
          name="notas"
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          maxLength={500}
          rows={2}
          placeholder="Después de caminar, en reposo, etc."
          className="w-full resize-none rounded-[20px] bg-card px-[18px] py-3.5 text-[15px] font-medium shadow-item outline-none placeholder:text-faint focus-visible:ring-2 focus-visible:ring-primary/40"
        />
      </div>

      {estado.status === "error" && (
        <p className="rounded-[14px] bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive" role="alert">
          {estado.message}
        </p>
      )}

      <div
        className="fixed inset-x-0 bottom-0 z-20 mx-auto flex w-full max-w-md gap-2.5 bg-gradient-to-t from-background from-70% to-transparent px-[18px] pt-4"
        style={{ paddingBottom: "var(--safe-bottom)" }}
      >
        {!puedeGuardar && (
          <p className="absolute inset-x-0 -top-3 text-center text-xs font-semibold text-subtle" aria-live="polite">
            Para guardar falta cargar {faltantes.join(" y ")}
          </p>
        )}
        <button
          type="button"
          onClick={() => volverAtras()}
          className="rounded-full border border-foreground/10 px-[22px] py-4 font-heading text-sm font-bold text-slate-brand"
        >
          Atrás
        </button>
        <button
          type="submit"
          disabled={!puedeGuardar || pendiente}
          className={cn(
            "flex-1 rounded-full py-4 font-heading text-sm font-extrabold tracking-[-0.01em] transition-all motion-reduce:transition-none",
            puedeGuardar && !pendiente
              ? "bg-primary text-primary-foreground shadow-cta-sm"
              : "bg-secondary text-subtle"
          )}
        >
          {pendiente ? "Guardando…" : `Guardar ${meta.nombreMin}`}
        </button>
      </div>
    </form>
  );
}

function Etiqueta({ text, requerido }: { text: string; requerido?: boolean }) {
  return (
    <div className="eyebrow mb-3.5 flex items-center gap-1 border-b border-foreground/[0.07] pb-2.5 text-subtle">
      {text}
      {requerido && <span className="text-primary">•</span>}
    </div>
  );
}
