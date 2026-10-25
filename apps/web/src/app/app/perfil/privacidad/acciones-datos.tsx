"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Segmentado } from "@/components/vita/segmentado";
import { RANGOS_BORRADO, type RangoBorrado } from "@/lib/historial/tipos";
import { borrarHistorialAction } from "./actions";

export type PersonaDatos = { id: string; etiqueta: string; nombre: string; esPropio: boolean };

type Formato = "pdf" | "completo";

const FORMATOS: { valor: Formato; titulo: string; sub: string }[] = [
  { valor: "pdf", titulo: "PDF para el médico", sub: "Resumen prolijo, fácil de imprimir" },
  { valor: "completo", titulo: "Archivo completo", sub: "Todo en un archivo JSON (sin las fotos de los estudios)" },
];

const CLASE_DESCARGA =
  "rounded-full bg-primary py-3.5 text-center text-[14.5px] font-extrabold text-primary-foreground shadow-cta transition-transform active:scale-[0.98] motion-reduce:transition-none";

// "Descargar mis datos" + "Borrar historial" (V7). Comparten "De quién".
export function AccionesDatos({ personas }: { personas: PersonaDatos[] }) {
  const router = useRouter();
  const [quien, setQuien] = useState(personas[0].id);
  const [formato, setFormato] = useState<Formato>("pdf");
  const [rango, setRango] = useState<RangoBorrado>("1y");
  const [confirmando, setConfirmando] = useState(false);
  const [texto, setTexto] = useState("");
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const persona = personas.find((p) => p.id === quien) ?? personas[0];
  const parametro = persona.esPropio ? "" : `?de=${encodeURIComponent(persona.id)}`;
  const rangoActual = RANGOS_BORRADO.find((r) => r.valor === rango)!;
  const confirmado = texto.trim().toUpperCase() === "BORRAR";

  function borrar() {
    setError(null);
    startTransition(async () => {
      const r = await borrarHistorialAction(rango, texto);
      if (r.status === "success") {
        const b = r.borrado;
        toast.success(
          `Historial borrado: ${b.tomas} tomas, ${b.mediciones} mediciones, ${b.estudios} estudios y ${b.conversaciones} conversaciones` +
            (b.recuerdos > 0 ? `, y ${b.recuerdos} ${b.recuerdos === 1 ? "recuerdo" : "recuerdos"} de vita que salieron de ellas.` : ".")
        );
        setConfirmando(false);
        setTexto("");
        router.refresh();
      } else setError(r.mensaje);
    });
  }

  return (
    <>
      <section>
        <h2 className="eyebrow px-0.5 pb-[9px] text-subtle">Descargar mis datos</h2>
        <div className="flex flex-col gap-3.5 rounded-[20px] bg-card p-4 shadow-card">
          {personas.length > 1 && (
            <div className="flex flex-col gap-2">
              <div className="pl-0.5 text-[12.5px] font-semibold text-slate-brand">De quién</div>
              <Segmentado
                chico
                etiqueta="De quién descargar los datos"
                opciones={personas.map((p) => ({ valor: p.id, etiqueta: p.etiqueta }))}
                valor={quien}
                onChange={(v) => {
                  setQuien(v);
                  setConfirmando(false);
                  setTexto("");
                }}
              />
            </div>
          )}
          <div className="flex flex-col gap-2" role="radiogroup" aria-label="Formato">
            <div className="pl-0.5 text-[12.5px] font-semibold text-slate-brand">Formato</div>
            {FORMATOS.map((f) => {
              const activo = formato === f.valor;
              return (
                <button
                  key={f.valor}
                  type="button"
                  role="radio"
                  aria-checked={activo}
                  onClick={() => setFormato(f.valor)}
                  className={cn(
                    "flex items-center gap-3 rounded-[var(--radius-item)] px-3.5 py-3 text-left transition-colors motion-reduce:transition-none",
                    activo ? "bg-primary/[0.06] shadow-[inset_0_0_0_1.5px_var(--primary)]" : "bg-secondary/60"
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-heading text-sm font-extrabold tracking-[-0.01em]">{f.titulo}</span>
                    <span className="mt-px block text-[11.5px] font-medium text-subtle">{f.sub}</span>
                  </span>
                  <span
                    className={cn(
                      "size-5 shrink-0 rounded-full",
                      activo ? "shadow-[inset_0_0_0_6px_var(--primary)]" : "shadow-[inset_0_0_0_2px_var(--faint)]"
                    )}
                  />
                </button>
              );
            })}
          </div>
          {formato === "pdf" ? (
            <Link href={`/app/perfil/historial${parametro}`} className={CLASE_DESCARGA}>
              Ver y guardar el PDF
            </Link>
          ) : (
            // Endpoint con Content-Disposition: attachment (descarga directa).
            <a href={`/app/perfil/historial/datos${parametro}`} download className={CLASE_DESCARGA}>
              Descargar archivo
            </a>
          )}
          <p className="-mt-1.5 text-center text-[11.5px] font-medium leading-[1.4] text-subtle">
            {formato === "pdf"
              ? "Se abre un resumen listo para imprimir o guardar como PDF."
              : "Se descarga en este dispositivo, al instante."}
          </p>
        </div>
      </section>

      <section>
        <h2 className="eyebrow px-0.5 pb-[9px] text-subtle">Borrar historial</h2>
        <div className="flex flex-col gap-3.5 rounded-[20px] bg-card p-4 shadow-card">
          <p className="text-pretty text-[12.5px] font-medium leading-[1.45] text-slate-brand">
            Borra tomas, mediciones, estudios (con sus fotos) y conversaciones con vita viejos, y también lo que vita recuerda
            de esas conversaciones. Tu cuenta, tus remedios, tus turnos y tu perfil de salud siguen como están.
          </p>
          <Segmentado
            chico
            etiqueta="Período a borrar"
            opciones={RANGOS_BORRADO.map((r) => ({ valor: r.valor, etiqueta: r.etiqueta }))}
            valor={rango}
            onChange={(v) => {
              setRango(v);
              setError(null);
            }}
          />
          {!persona.esPropio ? (
            <p className="rounded-[14px] bg-secondary px-3.5 py-2.5 text-[12.5px] font-medium leading-[1.4] text-slate-brand">
              El historial de {persona.nombre} solo lo puede borrar ella desde su propia cuenta. Elegí “Mis datos” para borrar el tuyo.
            </p>
          ) : !confirmando ? (
            <button
              type="button"
              onClick={() => setConfirmando(true)}
              className="rounded-full border border-destructive/30 bg-card py-[13px] text-sm font-extrabold text-destructive"
            >
              Borrar historial
            </button>
          ) : (
            <div className="flex flex-col gap-2.5 border-t border-foreground/[0.06] pt-3">
              <p className="text-pretty text-[13.5px] font-bold leading-[1.4]">
                Vas a borrar {rango === "all" ? "todo el historial (menos las tomas de hoy)" : `el historial ${rangoActual.frase}`}: tomas,
                mediciones, estudios y conversaciones con vita, y los recuerdos de vita que salieron de esas conversaciones. No se puede deshacer.
              </p>
              <input
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                autoComplete="off"
                autoCapitalize="characters"
                placeholder="Escribí BORRAR"
                aria-label="Escribí BORRAR para confirmar"
                className="rounded-full border border-foreground/10 bg-secondary px-4 py-3 text-center text-sm font-bold tracking-[0.06em] outline-none"
              />
              {error && <p role="alert" className="rounded-[14px] bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">{error}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setConfirmando(false);
                    setTexto("");
                    setError(null);
                  }}
                  className="flex-1 rounded-full border border-foreground/10 py-3 text-[13.5px] font-bold text-slate-brand"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={!confirmado || pendiente}
                  onClick={borrar}
                  className={cn(
                    "flex-1 rounded-full py-3 text-[13.5px] font-extrabold text-primary-foreground",
                    confirmado ? "bg-destructive" : "bg-destructive/40"
                  )}
                >
                  {pendiente ? "Borrando…" : "Borrar"}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
