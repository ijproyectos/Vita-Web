"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Interruptor } from "@/components/vita/interruptor";
import type { ContradiccionVista, GrupoRecuerdos, RecuerdoVista, VistaMemoria } from "@/lib/memoria/privacidad";
import type { ResumenGuardado } from "@/lib/memoria/resumen";
import { borrarResumenAction, cambiarMemoriaActivaAction, olvidarRecuerdoAction, olvidarTodoAction, resolverContradiccionAction } from "./actions";

const TARJETA = "overflow-hidden rounded-[20px] bg-card shadow-card";
const BOTON_TEXTO = "rounded-full px-2.5 py-1.5 text-[12.5px] font-bold text-teal-deep disabled:opacity-50";

export function PantallaMemoria({ vista, resumen }: { vista: VistaMemoria; resumen: ResumenGuardado | null }) {
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

      {activa && vista.contradicciones.length > 0 && (
        <section>
          <h2 className="eyebrow px-0.5 pb-[9px] text-subtle">Para confirmar</h2>
          <div className={TARJETA}>
            {vista.contradicciones.map((c) => (
              <Contradiccion key={c.id} contradiccion={c} />
            ))}
          </div>
          <p className="px-1 pt-2.5 text-pretty text-xs font-medium leading-[1.45] text-slate-brand">
            Dos cosas que me contaste parecen no coincidir. Vos decidís cuál vale: yo no elijo por mi cuenta.
          </p>
        </section>
      )}

      {!hayAlgo ? (
        <p className="rounded-[20px] bg-card p-4 text-pretty text-[13.5px] font-medium leading-[1.45] text-slate-brand shadow-card">
          Todavía no recuerdo nada de vos. Cuando me cuentes algo que valga la pena para la próxima, lo vas a ver acá y vas a poder
          borrarlo.
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

      {resumen && <ResumenCharlas resumen={resumen} />}

      <OlvidarTodo hayAlgo={hayAlgo || !!resumen} />
    </>
  );
}

function Contradiccion({ contradiccion }: { contradiccion: ContradiccionVista }) {
  const router = useRouter();
  const [confirmandoNinguna, setConfirmandoNinguna] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  function resolver(vale: "a" | "b" | "ambas" | "ninguna") {
    setError(null);
    startTransition(async () => {
      const r = await resolverContradiccionAction(contradiccion.id, vale);
      if (r.status === "success") toast.success(vale === "ninguna" ? "Listo, me olvidé de las dos." : "Listo, gracias por aclararlo.");
      else setError(r.mensaje);
      router.refresh();
    });
  }

  const OPCION = "rounded-full border border-foreground/10 bg-card px-3 py-2 text-[12.5px] font-bold text-teal-deep disabled:opacity-50";
  return (
    <div className="px-4 py-3.5 [&:not(:first-child)]:border-t [&:not(:first-child)]:border-foreground/[0.06]">
      <p className="text-pretty text-[14px] font-bold leading-snug">{contradiccion.pregunta}</p>
      <div className="mt-2 flex flex-col gap-1.5">
        <div className="rounded-[14px] bg-secondary px-3 py-2.5 text-[13px] font-medium leading-snug">
          <span className="block text-[11px] font-bold text-subtle">Primera</span>
          {contradiccion.textoA}
        </div>
        <div className="rounded-[14px] bg-secondary px-3 py-2.5 text-[13px] font-medium leading-snug">
          <span className="block text-[11px] font-bold text-subtle">Segunda</span>
          {contradiccion.textoB}
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-2 rounded-[14px] bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
          {error}
        </p>
      )}
      {!confirmandoNinguna ? (
        <div className="mt-2.5 flex flex-wrap gap-2">
          <button type="button" disabled={pendiente} className={OPCION} onClick={() => resolver("a")}>
            Vale la primera
          </button>
          <button type="button" disabled={pendiente} className={OPCION} onClick={() => resolver("b")}>
            Vale la segunda
          </button>
          <button type="button" disabled={pendiente} className={OPCION} onClick={() => resolver("ambas")}>
            Valen las dos
          </button>
          <button type="button" disabled={pendiente} className={cn(OPCION, "text-destructive")} onClick={() => setConfirmandoNinguna(true)}>
            Ninguna
          </button>
        </div>
      ) : (
        <div className="mt-2.5 flex flex-col gap-2 rounded-[var(--radius-item)] bg-secondary p-3">
          <p className="text-pretty text-[12.5px] font-medium leading-[1.45] text-slate-brand">
            Me olvido de las dos cosas y no uso los mensajes de donde salieron. Siguen en tu historial, pero no los busco ni los resumo.
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setConfirmandoNinguna(false)} className="flex-1 rounded-full border border-foreground/10 bg-card py-2.5 text-[13px] font-bold text-slate-brand">
              Cancelar
            </button>
            <button type="button" disabled={pendiente} onClick={() => resolver("ninguna")} className="flex-1 rounded-full bg-destructive py-2.5 text-[13px] font-extrabold text-primary-foreground disabled:opacity-50">
              {pendiente ? "Un segundo…" : "Olvidar las dos"}
            </button>
          </div>
        </div>
      )}
    </div>
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

function Recuerdo({ recuerdo }: { recuerdo: RecuerdoVista }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  function olvidar() {
    setError(null);
    startTransition(async () => {
      const r = await olvidarRecuerdoAction(recuerdo.id);
      if (r.status === "success") {
        toast.success("Listo, ya no lo recuerdo.");
        router.refresh();
      } else setError(r.mensaje);
    });
  }

  return (
    <div className="px-4 py-3.5 [&:not(:first-child)]:border-t [&:not(:first-child)]:border-foreground/[0.06]">
      <div className="text-[14.5px] font-semibold leading-snug">{recuerdo.texto}</div>
      <div className="mt-0.5 text-[11.5px] font-medium text-subtle">{[recuerdo.fuente, recuerdo.vence].filter(Boolean).join(" · ")}</div>
      {!confirmando ? (
        <div className="-ml-2.5 mt-1.5 flex flex-wrap">
          <button type="button" className={cn(BOTON_TEXTO, "text-destructive")} onClick={() => setConfirmando(true)}>
            Dejar de recordar
          </button>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-2.5 rounded-[var(--radius-item)] bg-secondary p-3.5">
          <p className="text-pretty text-[12.5px] font-medium leading-[1.45] text-slate-brand">
            vita se olvida de esto y no va a buscar los mensajes de donde salió. Esos mensajes siguen en tu historial del chat.
          </p>
          {error && <p role="alert" className="rounded-[14px] bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setConfirmando(false);
                setError(null);
              }}
              className="flex-1 rounded-full border border-foreground/10 bg-card py-2.5 text-[13.5px] font-bold text-slate-brand"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={pendiente}
              onClick={olvidar}
              className="flex-1 rounded-full bg-destructive py-2.5 text-[13.5px] font-extrabold text-primary-foreground disabled:opacity-50"
            >
              {pendiente ? "Un segundo…" : "Dejar de recordar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function OlvidarTodo({ hayAlgo }: { hayAlgo: boolean }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();
  const confirmado = texto.trim().toUpperCase() === "BORRAR";

  function borrar() {
    setError(null);
    startTransition(async () => {
      const r = await olvidarTodoAction(texto);
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
      <h2 className="eyebrow px-0.5 pb-[9px] text-subtle">Olvidar todo</h2>
      <div className="flex flex-col gap-3 rounded-[20px] bg-card p-4 shadow-card">
        <p className="text-pretty text-[12.5px] font-medium leading-[1.45] text-slate-brand">
          Borra todo lo que vita recuerda de vos y de tu familia, y vita deja de buscar en lo que le dijiste hasta ahora. Los
          mensajes siguen en tu historial del chat; para borrarlos, usá “Borrar historial” en{" "}
          <Link href="/app/perfil/privacidad" className="font-bold text-teal-deep underline">
            Privacidad y datos
          </Link>
          .
        </p>
        {!confirmando ? (
          <button
            type="button"
            disabled={!hayAlgo}
            onClick={() => setConfirmando(true)}
            className="rounded-full border border-destructive/30 bg-card py-[13px] text-sm font-extrabold text-destructive disabled:opacity-40"
          >
            Olvidar todo
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

function ResumenCharlas({ resumen }: { resumen: ResumenGuardado }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();

  function borrar() {
    startTransition(async () => {
      const r = await borrarResumenAction();
      if (r.status === "success") {
        toast.success("Listo, borré el resumen de tus charlas.");
        router.refresh();
      } else toast.error(r.mensaje);
    });
  }

  return (
    <section>
      <h2 className="eyebrow px-0.5 pb-[9px] text-subtle">Resumen de tus charlas</h2>
      <div className={cn(TARJETA, "p-4")}>
        <p className="whitespace-pre-line text-pretty text-[13.5px] font-medium leading-[1.5]">{resumen.resumen}</p>
        {resumen.pendientes.length > 0 && (
          <ul className="mt-2.5 list-disc pl-5 text-[12.5px] font-medium leading-[1.45] text-slate-brand">
            {resumen.pendientes.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        <p className="mt-2.5 text-pretty text-xs font-medium leading-[1.45] text-slate-brand">
          Lo arma vita sola a partir de lo que charlan, para retomar una conversación. Si lo borrás, lo vuelve a armar con lo que
          cuentes de ahora en más. Tus mensajes siguen en el historial del chat.
        </p>
        <button type="button" disabled={pendiente} onClick={borrar} className={cn(BOTON_TEXTO, "-ml-2.5 mt-1.5 text-destructive")}>
          {pendiente ? "Borrando…" : "Borrar resumen"}
        </button>
      </div>
    </section>
  );
}
