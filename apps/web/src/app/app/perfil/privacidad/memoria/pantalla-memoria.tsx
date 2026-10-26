"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Interruptor } from "@/components/vita/interruptor";
import type { GrupoRecuerdos, MensajeFuente, RecuerdoVista, VistaMemoria } from "@/lib/memoria/privacidad";
import {
  borrarTodoMemoriaAction,
  cambiarMemoriaActivaAction,
  corregirRecuerdoAction,
  olvidarRecuerdoAction,
  previaOlvidoAction,
} from "./actions";

const TARJETA = "overflow-hidden rounded-[20px] bg-card shadow-card";
const BOTON_TEXTO = "rounded-full px-2.5 py-1.5 text-[12.5px] font-bold text-teal-deep disabled:opacity-50";

export function PantallaMemoria({ vista }: { vista: VistaMemoria }) {
  const router = useRouter();
  const [activa, setActiva] = useState(vista.activa);
  const [pendiente, startTransition] = useTransition();

  function cambiarActiva(valor: boolean) {
    const anterior = activa;
    setActiva(valor);
    startTransition(async () => {
      const r = await cambiarMemoriaActivaAction(valor);
      if (r.status === "error") {
        setActiva(anterior);
        toast.error(r.mensaje);
      } else router.refresh();
    });
  }

  if (!vista.disponible) {
    return (
      <p className="rounded-[20px] bg-card p-4 text-pretty text-[13.5px] font-medium leading-[1.45] text-slate-brand shadow-card">
        Esta parte todavía no está disponible. Cuando lo esté, vas a ver acá lo que vita recuerda de vos.
      </p>
    );
  }

  const hayAlgo = vista.grupos.length > 0 || vista.pasajeros.length > 0;

  return (
    <>
      <section>
        <div className={cn(TARJETA, "flex items-start gap-3 p-4")}>
          <div className="min-w-0 flex-1">
            <div className="font-heading text-[14.5px] font-extrabold tracking-[-0.02em]">vita recuerda lo que le contás</div>
            <p className="mt-1 text-pretty text-[12.5px] font-medium leading-[1.45] text-slate-brand">
              Si lo apagás, vita no guarda recuerdos nuevos y no usa los que ya tiene. No se borra nada: si lo prendés de nuevo,
              vuelven.
            </p>
          </div>
          <Interruptor activo={activa} onChange={cambiarActiva} label="vita recuerda lo que le contás" disabled={pendiente} />
        </div>
      </section>

      {!hayAlgo ? (
        <p className="rounded-[20px] bg-card p-4 text-pretty text-[13.5px] font-medium leading-[1.45] text-slate-brand shadow-card">
          Todavía no recuerdo nada de vos. Cuando me cuentes algo que valga la pena para la próxima, lo vas a ver acá y vas a poder
          corregirlo o borrarlo.
        </p>
      ) : (
        <>
          {vista.grupos.map((g) => (
            <Grupo key={g.clave} grupo={g} activa={activa} />
          ))}
          {vista.pasajeros.length > 0 && (
            <section>
              <h2 className="eyebrow px-0.5 pb-[9px] text-subtle">Por unos días</h2>
              <div className={TARJETA}>
                {vista.pasajeros.map((r) => (
                  <Recuerdo key={r.id} recuerdo={r} />
                ))}
              </div>
              <p className="px-1 pt-2.5 text-pretty text-xs font-medium leading-[1.45] text-slate-brand">
                Son cosas del momento, como cómo te sentías. Se olvidan solas a los 3 días.
              </p>
            </section>
          )}
        </>
      )}

      <BorrarTodo hayAlgo={hayAlgo} />
    </>
  );
}

function Grupo({ grupo, activa }: { grupo: GrupoRecuerdos; activa: boolean }) {
  return (
    <section>
      <h2 className="eyebrow px-0.5 pb-[9px] text-subtle">{grupo.titulo}</h2>
      <div className={cn(TARJETA, !activa && "opacity-70")}>
        {grupo.recuerdos.map((r) => (
          <Recuerdo key={r.id} recuerdo={r} />
        ))}
      </div>
    </section>
  );
}

type Modo = "ver" | "corregir" | "dejar" | "eliminar";

function Recuerdo({ recuerdo }: { recuerdo: RecuerdoVista }) {
  const router = useRouter();
  const [modo, setModo] = useState<Modo>("ver");
  const [texto, setTexto] = useState(recuerdo.texto);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();
  const [origen, setOrigen] = useState<MensajeFuente[] | null>(null);
  const [relacionados, setRelacionados] = useState<MensajeFuente[]>([]);
  const [tildados, setTildados] = useState<Set<string>>(new Set());
  const [cargandoPrevia, setCargandoPrevia] = useState(false);

  function volver() {
    setModo("ver");
    setError(null);
    setTexto(recuerdo.texto);
  }

  function corregir() {
    setError(null);
    startTransition(async () => {
      const r = await corregirRecuerdoAction(recuerdo.id, texto);
      if (r.status === "success") {
        toast.success("Listo, ahora recuerdo esto.");
        setModo("ver");
        router.refresh();
      } else setError(r.mensaje);
    });
  }

  async function abrirOlvido(m: "dejar" | "eliminar") {
    setModo(m);
    setError(null);
    setTildados(new Set());
    setOrigen(null);
    setRelacionados([]);
    setCargandoPrevia(true);
    try {
      const r = await previaOlvidoAction(recuerdo.id);
      if (r.status === "success") {
        setOrigen(r.previa.origen);
        setRelacionados(r.previa.relacionados);
      } else setError(r.mensaje);
    } catch {
      setError("No pude ver de dónde salió este recuerdo. Revisá tu conexión y probá de nuevo.");
    } finally {
      setCargandoPrevia(false);
    }
  }

  function confirmarOlvido() {
    setError(null);
    startTransition(async () => {
      const r = await olvidarRecuerdoAction(recuerdo.id, modo, [...tildados]);
      if (r.status === "success") {
        toast.success(modo === "eliminar" ? "Listo, lo eliminé." : "Listo, ya no lo recuerdo.");
        router.refresh();
      } else setError(r.mensaje);
    });
  }

  function alternar(id: string) {
    setTildados((previo) => {
      const nuevo = new Set(previo);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });
  }

  const eliminar = modo === "eliminar";

  return (
    <div className="px-4 py-3.5 [&:not(:first-child)]:border-t [&:not(:first-child)]:border-foreground/[0.06]">
      {modo === "corregir" ? (
        <div className="flex flex-col gap-2.5">
          <label className="pl-0.5 text-[12.5px] font-semibold text-slate-brand" htmlFor={`rec-${recuerdo.id}`}>
            Qué querés que recuerde
          </label>
          <textarea
            id={`rec-${recuerdo.id}`}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={200}
            rows={3}
            className="resize-none rounded-[var(--radius-item)] border border-foreground/10 bg-secondary px-3.5 py-3 text-[14px] font-semibold leading-snug outline-none"
          />
          {error && <p role="alert" className="rounded-[14px] bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={volver} className="flex-1 rounded-full border border-foreground/10 py-2.5 text-[13.5px] font-bold text-slate-brand">
              Cancelar
            </button>
            <button
              type="button"
              disabled={pendiente || texto.trim() === ""}
              onClick={corregir}
              className="flex-1 rounded-full bg-primary py-2.5 text-[13.5px] font-extrabold text-primary-foreground disabled:opacity-50"
            >
              {pendiente ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="text-[14.5px] font-semibold leading-snug">{recuerdo.texto}</div>
          <div className="mt-0.5 text-[11.5px] font-medium text-subtle">{[recuerdo.fuente, recuerdo.vence].filter(Boolean).join(" · ")}</div>
          {modo === "ver" && (
            <div className="-ml-2.5 mt-1.5 flex flex-wrap">
              <button type="button" className={BOTON_TEXTO} onClick={() => setModo("corregir")}>
                Corregir
              </button>
              <button type="button" className={BOTON_TEXTO} onClick={() => abrirOlvido("dejar")}>
                Dejar de recordar
              </button>
              <button type="button" className={cn(BOTON_TEXTO, "text-destructive")} onClick={() => abrirOlvido("eliminar")}>
                Eliminar
              </button>
            </div>
          )}
        </>
      )}

      {(modo === "dejar" || modo === "eliminar") && (
        <div className="mt-3 flex flex-col gap-2.5 rounded-[var(--radius-item)] bg-secondary p-3.5">
          <p className="text-pretty text-[13.5px] font-bold leading-[1.4]">
            {eliminar ? "Eliminar este recuerdo y de dónde salió" : "Dejar de recordar esto"}
          </p>
          <p className="text-pretty text-[12.5px] font-medium leading-[1.45] text-slate-brand">
            {eliminar
              ? "Se borra el recuerdo y también los mensajes de tu historial de donde salió. No se puede deshacer."
              : "vita se olvida del recuerdo y no va a usar los mensajes de donde salió: siguen en tu historial del chat, pero vita no los busca ni los resume."}
          </p>
          {cargandoPrevia ? (
            <p className="text-[12.5px] font-medium text-subtle">Buscando de dónde salió…</p>
          ) : origen === null ? (
            <p className="text-pretty text-[12.5px] font-medium leading-[1.45] text-destructive">
              Sin ver de qué mensajes salió no puedo {eliminar ? "eliminarlo" : "dejar de recordarlo"} sin dudas, así que no hago nada
              todavía. Probá de nuevo.
            </p>
          ) : (
            <>
              {origen && origen.length > 0 ? (
                <ListaMensajes titulo={eliminar ? "Mensajes que se van a borrar" : "Mensajes que se van a dejar de recordar"} mensajes={origen} />
              ) : (
                <p className="text-pretty text-[12.5px] font-medium leading-[1.45] text-slate-brand">
                  No sé de qué mensaje salió, así que solo cambia el recuerdo. Si lo dijiste en otro mensaje, podés tildarlo abajo.
                </p>
              )}
              {relacionados.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <div className="text-[12.5px] font-semibold text-slate-brand">
                    Otros mensajes tuyos sobre lo mismo. Tildá los que también querés incluir:
                  </div>
                  {relacionados.map((m) => (
                    <label key={m.id} className="flex items-start gap-2.5 rounded-[14px] bg-card px-3 py-2.5 text-[12.5px] font-medium leading-snug">
                      <input type="checkbox" checked={tildados.has(m.id)} onChange={() => alternar(m.id)} className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]" />
                      <span>
                        <span className="block text-[11px] text-subtle">{m.fecha}</span>
                        {m.texto}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </>
          )}
          {error && <p role="alert" className="rounded-[14px] bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={volver} className="flex-1 rounded-full border border-foreground/10 bg-card py-2.5 text-[13.5px] font-bold text-slate-brand">
              Cancelar
            </button>
            <button
              type="button"
              disabled={pendiente || cargandoPrevia || origen === null}
              onClick={confirmarOlvido}
              className={cn("flex-1 rounded-full py-2.5 text-[13.5px] font-extrabold text-primary-foreground disabled:opacity-50", eliminar ? "bg-destructive" : "bg-primary")}
            >
              {pendiente ? "Un segundo…" : eliminar ? "Eliminar" : "Dejar de recordar"}
            </button>
            {origen === null && !cargandoPrevia && (
              <button
                type="button"
                onClick={() => abrirOlvido(modo === "eliminar" ? "eliminar" : "dejar")}
                className="flex-1 rounded-full bg-card py-2.5 text-[13.5px] font-bold text-teal-deep"
              >
                Reintentar
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ListaMensajes({ titulo, mensajes }: { titulo: string; mensajes: MensajeFuente[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[12.5px] font-semibold text-slate-brand">{titulo}</div>
      {mensajes.map((m) => (
        <div key={m.id} className="rounded-[14px] bg-card px-3 py-2.5 text-[12.5px] font-medium leading-snug">
          <span className="block text-[11px] text-subtle">{m.fecha}</span>
          {m.texto}
        </div>
      ))}
    </div>
  );
}

function BorrarTodo({ hayAlgo }: { hayAlgo: boolean }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();
  const confirmado = texto.trim().toUpperCase() === "BORRAR";

  function borrar() {
    setError(null);
    startTransition(async () => {
      const r = await borrarTodoMemoriaAction(texto);
      if (r.status === "success") {
        toast.success("Listo, vita ya no recuerda nada de lo que le contaste.");
        setConfirmando(false);
        setTexto("");
        router.refresh();
      } else setError(r.mensaje);
    });
  }

  return (
    <section>
      <h2 className="eyebrow px-0.5 pb-[9px] text-subtle">Borrar todo</h2>
      <div className="flex flex-col gap-3 rounded-[20px] bg-card p-4 shadow-card">
        <p className="text-pretty text-[12.5px] font-medium leading-[1.45] text-slate-brand">
          Borra todo lo que vita recuerda de vos y de tu familia. Los mensajes de tus charlas no se tocan: siguen en tu historial del
          chat (para borrarlos, usá “Borrar historial” en Privacidad y datos).
        </p>
        {!confirmando ? (
          <button
            type="button"
            disabled={!hayAlgo}
            onClick={() => setConfirmando(true)}
            className="rounded-full border border-destructive/30 bg-card py-[13px] text-sm font-extrabold text-destructive disabled:opacity-40"
          >
            Borrar todo lo que vita recuerda
          </button>
        ) : (
          <div className="flex flex-col gap-2.5 border-t border-foreground/[0.06] pt-3">
            <p className="text-pretty text-[13.5px] font-bold leading-[1.4]">Vas a borrar todos los recuerdos. No se puede deshacer.</p>
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
                className={cn("flex-1 rounded-full py-3 text-[13.5px] font-extrabold text-primary-foreground", confirmado ? "bg-destructive" : "bg-destructive/40")}
              >
                {pendiente ? "Borrando…" : "Borrar"}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
