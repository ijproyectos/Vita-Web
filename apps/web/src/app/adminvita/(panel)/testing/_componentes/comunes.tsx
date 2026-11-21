import type { ReactNode } from "react";
import { Etiqueta } from "../../_componentes/ui";
import { tono, type ConteoEstados } from "@/lib/admin/testing/logica";

export const CAMPO = "w-full rounded-2xl bg-panel-track px-4 py-2.5 text-sm font-normal text-ink focus-visible:outline-2 focus-visible:outline-teal";
export const TARJETA = "rounded-[28px] bg-card p-5 shadow-panel";

export function Campo({ etiqueta, children, ancho }: { etiqueta: string; children: ReactNode; ancho?: boolean }) {
  return (
    <label className={`flex flex-col gap-1 text-xs font-bold text-slate-brand ${ancho ? "sm:col-span-2" : ""}`}>
      {etiqueta}
      {children}
    </label>
  );
}

export function Seleccion({ nombre, valores, actual, vacio }: { nombre: string; valores: readonly string[]; actual?: string | null; vacio?: string }) {
  return (
    <select name={nombre} defaultValue={actual ?? (vacio !== undefined ? "" : valores[0])} className={CAMPO}>
      {vacio !== undefined ? <option value="">{vacio}</option> : null}
      {valores.map((v) => (
        <option key={v} value={v}>
          {v}
        </option>
      ))}
    </select>
  );
}

export function SeleccionPersona({ nombre, personas, actual, vacio }: { nombre: string; personas: { email: string }[]; actual?: string | null; vacio: string }) {
  const lista = actual && !personas.some((p) => p.email === actual) ? [{ email: actual }, ...personas] : personas;
  return (
    <select name={nombre} defaultValue={actual ?? ""} className={CAMPO}>
      <option value="">{vacio}</option>
      {lista.map((p) => (
        <option key={p.email} value={p.email}>
          {p.email}
        </option>
      ))}
    </select>
  );
}

export function EtiquetaEstado({ valor }: { valor: string }) {
  return <Etiqueta tono={tono(valor)}>{valor}</Etiqueta>;
}

export function ErrorTesting() {
  return (
    <p role="alert" className="rounded-[28px] bg-destructive/10 p-5 text-sm font-semibold text-destructive">
      No se pudieron leer los datos de testing. Revisá que la migración 063 esté aplicada y volvé a intentar.
    </p>
  );
}

export function NoEncontrado({ que }: { que: string }) {
  return <p className={`${TARJETA} text-sm text-subtle`}>{que} no existe (o ya se borró).</p>;
}

/** Barra de avance en CSS puro: probados sobre total, con OK / Falla / Bloqueado en distinto tono. */
export function BarraAvance({ conteo, total }: { conteo: ConteoEstados; total: number }) {
  const pct = (n: number) => (total === 0 ? 0 : (n / total) * 100);
  return (
    <div
      role="img"
      aria-label={`OK ${conteo.OK}, falla ${conteo.Falla}, bloqueado ${conteo.Bloqueado}, no aplica ${conteo["No aplica"]}, pendiente ${conteo.Pendiente}`}
      className="flex h-2.5 w-full overflow-hidden rounded-full bg-panel-track"
    >
      <span className="bg-success" style={{ width: `${pct(conteo.OK)}%` }} />
      <span className="bg-destructive" style={{ width: `${pct(conteo.Falla)}%` }} />
      <span className="bg-amber" style={{ width: `${pct(conteo.Bloqueado)}%` }} />
      <span className="bg-subtle/50" style={{ width: `${pct(conteo["No aplica"])}%` }} />
    </div>
  );
}

export function textoConteo(c: ConteoEstados): string {
  return `${c.OK} OK · ${c.Falla} falla · ${c.Bloqueado} bloq. · ${c.Pendiente} pend.`;
}
