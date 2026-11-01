"use client";

import { useActionState, useState } from "react";
import { crearCodigosAction, type EstadoAltaCodigos } from "./actions";

const INICIAL: EstadoAltaCodigos = { status: "idle" };

const CAMPO = "w-full rounded-[var(--radius-item)] border border-line bg-paper px-3 py-2 text-sm";

export function FormularioCodigos() {
  const [estado, crear, creando] = useActionState(crearCodigosAction, INICIAL);
  const [copiado, setCopiado] = useState(false);

  async function copiar(codigos: string[]) {
    try {
      await navigator.clipboard.writeText(codigos.join("\n"));
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <div className="space-y-4">
      <form action={crear} className="grid gap-3 rounded-[var(--radius-item)] border border-line bg-paper p-4 shadow-item sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs font-bold text-slate-brand">
          Tipo
          <select name="tipo" defaultValue="plus" className={CAMPO}>
            <option value="plus">vita plus · 15 días</option>
            <option value="admin">vita admin · sin vencimiento</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-bold text-slate-brand">
          Usos máximos por código
          <input name="usosMax" type="number" min={1} max={10000} step={1} defaultValue={1} required className={CAMPO} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-bold text-slate-brand">
          Vence el (opcional)
          <input name="vence" type="date" className={CAMPO} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-bold text-slate-brand">
          Cantidad a generar (1 a 20)
          <input name="cantidad" type="number" min={1} max={20} step={1} defaultValue={1} required className={CAMPO} />
        </label>
        <div className="sm:col-span-2 lg:col-span-4">
          <button type="submit" disabled={creando} className="rounded-full bg-teal px-5 py-2 text-sm font-bold text-on-ink disabled:opacity-60">
            {creando ? "Generando…" : "Generar códigos"}
          </button>
        </div>
      </form>

      {estado.status === "error" ? (
        <p role="alert" className="rounded-[var(--radius-item)] border border-destructive/40 bg-destructive/10 p-3 text-sm font-semibold text-destructive">
          {estado.mensaje}
        </p>
      ) : null}

      {estado.status === "success" ? (
        <div role="status" className="rounded-[var(--radius-item)] border border-teal-line bg-mint p-4">
          <p className="text-sm font-extrabold text-teal-deep">
            {estado.codigos.length === 1 ? "Código creado" : `${estado.codigos.length} códigos creados`}. Copialos ahora: no se
            vuelven a mostrar.
          </p>
          {estado.aviso ? <p className="mt-1 text-xs text-teal-deep">{estado.aviso}</p> : null}
          <ul className="mt-3 space-y-1">
            {estado.codigos.map((c) => (
              <li key={c} className="font-mono text-base font-extrabold tracking-wider text-ink">
                {c}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => void copiar(estado.codigos)}
            className="mt-3 rounded-full bg-ink px-4 py-1.5 text-xs font-bold text-on-ink"
          >
            {copiado ? "Copiado" : estado.codigos.length === 1 ? "Copiar código" : "Copiar todos"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
