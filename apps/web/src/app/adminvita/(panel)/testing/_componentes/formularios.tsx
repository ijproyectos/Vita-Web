"use client";

import { useActionState, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { EstadoForm } from "../actions";

const INICIAL: EstadoForm = { status: "idle" };

/** Formulario con Server Action: muestra el resultado y, si `limpiar`, vacía los campos al guardar. */
export function FormularioAccion({
  accion,
  children,
  boton,
  className = "",
  limpiar = false,
  irA,
}: {
  accion: (previo: EstadoForm, datos: FormData) => Promise<EstadoForm>;
  children: ReactNode;
  boton: string;
  className?: string;
  limpiar?: boolean;
  /** Si el resultado trae un id, navega a `irA + id` (p. ej. al detalle del bug recién creado). */
  irA?: string;
}) {
  const [estado, enviar, enviando] = useActionState(accion, INICIAL);
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();
  useEffect(() => {
    if (estado.status !== "success") return;
    if (limpiar) ref.current?.reset();
    if (irA && estado.id !== undefined) router.push(`${irA}${estado.id}`);
  }, [estado, limpiar, irA, router]);
  return (
    <form ref={ref} action={enviar} className={`flex flex-col gap-3 ${className}`}>
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={enviando} className="rounded-full bg-teal px-6 py-2.5 text-sm font-bold text-on-ink disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal">
          {enviando ? "Guardando…" : boton}
        </button>
        {estado.status === "error" ? (
          <p role="alert" className="text-sm font-semibold text-destructive">
            {estado.mensaje}
          </p>
        ) : null}
        {estado.status === "success" ? (
          <p role="status" className="text-sm font-semibold text-teal-deep">
            {estado.mensaje}
          </p>
        ) : null}
      </div>
    </form>
  );
}

/** Botón que ejecuta una Server Action ya "bindeada" (con sus argumentos); con confirmación en la propia página opcional. */
export function BotonAccion({
  accion,
  texto,
  confirmar,
  tono = "neutro",
  irA,
}: {
  accion: () => Promise<EstadoForm>;
  texto: string;
  confirmar?: string;
  tono?: "neutro" | "peligro" | "primario";
  irA?: string;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const clases = {
    neutro: "border border-line text-ink",
    peligro: "bg-destructive text-destructive-foreground",
    primario: "bg-teal text-on-ink",
  }[tono];

  function ejecutar() {
    iniciar(async () => {
      const r = await accion();
      if (r.status === "error") {
        setError(r.mensaje);
        setConfirmando(false);
        return;
      }
      setError(null);
      setConfirmando(false);
      if (irA && r.status === "success" && r.id !== undefined) router.push(`${irA}${r.id}`);
    });
  }

  if (confirmar && confirmando) {
    return (
      <span role="alertdialog" aria-label={confirmar} className="inline-flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold">{confirmar}</span>
        <button type="button" disabled={pendiente} onClick={ejecutar} className="rounded-full bg-destructive px-3 py-1 text-xs font-bold text-destructive-foreground disabled:opacity-60">
          {pendiente ? "Un momento…" : "Sí"}
        </button>
        <button type="button" disabled={pendiente} onClick={() => setConfirmando(false)} className="rounded-full border border-line px-3 py-1 text-xs font-bold">
          No
        </button>
      </span>
    );
  }
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={pendiente}
        onClick={() => (confirmar ? setConfirmando(true) : ejecutar())}
        className={`rounded-full px-4 py-1.5 text-xs font-bold disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal ${clases}`}
      >
        {pendiente ? "Un momento…" : texto}
      </button>
      {error ? (
        <span role="alert" className="text-xs font-semibold text-destructive">
          {error}
        </span>
      ) : null}
    </span>
  );
}
