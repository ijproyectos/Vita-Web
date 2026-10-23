"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { VitaIcon } from "@/lib/vita-icons";
import { PanelCodigoAcceso } from "@/components/vita/panel-codigo-acceso";
import { MINUTOS_VIGENCIA_CODIGO_ACCESO } from "@/lib/acceso-codigo/tipos";
import { generarCodigoAccesoAction } from "@/app/cuidar/[elderId]/actions";
import { cambiarPerfilActivoAction, estadoConexionAction } from "../../actions";

type Codigo = { codigo: string; expiraAt: string };

export function ConectarCelular({ personaId, nombre, yaConectado }: { personaId: string; nombre: string; yaConectado: boolean }) {
  const router = useRouter();
  const [codigo, setCodigo] = useState<Codigo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conectado, setConectado] = useState(false);
  const [generando, startGenerar] = useTransition();
  const [yendo, startIr] = useTransition();
  const pedido = useRef(false);

  const pedirCodigo = useCallback(async () => {
    try {
      const r = await generarCodigoAccesoAction(personaId);
      if (r.status === "success") {
        setError(null);
        setCodigo({ codigo: r.codigo, expiraAt: r.expiraAt });
      } else {
        setError(r.message);
      }
    } catch {
      setError("No pudimos generar el código. Probá de nuevo.");
    }
  }, [personaId]);

  function generar() {
    startGenerar(pedirCodigo);
  }

  // El diseño muestra el código apenas se abre la pantalla.
  useEffect(() => {
    if (pedido.current) return;
    pedido.current = true;
    startGenerar(pedirCodigo);
  }, [pedirCodigo]);

  // Mientras hay un código vigente y la persona todavía no había entrado,
  // se consulta cada 5 s si ya inició sesión.
  const esperando = Boolean(codigo) && !yaConectado && !conectado;
  const expiraAt = codigo?.expiraAt;
  useEffect(() => {
    if (!esperando || !expiraAt) return;
    const t = setInterval(async () => {
      if (new Date(expiraAt).getTime() < new Date().getTime()) return;
      const r = await estadoConexionAction(personaId).catch(() => null);
      if (r?.status === "success" && r.conectado) setConectado(true);
    }, 5000);
    return () => clearInterval(t);
  }, [esperando, expiraAt, personaId]);

  function verRutina() {
    startIr(async () => {
      try {
        const r = await cambiarPerfilActivoAction(personaId);
        if (r.status === "error") {
          toast.error(r.message);
          return;
        }
        router.push("/app/rutina");
      } catch {
        toast.error("No pudimos cambiar de perfil.");
      }
    });
  }

  if (conectado) {
    return (
      <div className="flex flex-col items-center gap-3.5 pt-6 text-center">
        <span className="flex size-[78px] items-center justify-center rounded-full bg-chip-teal-bg text-teal-deep">
          <VitaIcon name="check" size={34} strokeWidth={3} />
        </span>
        <div className="font-heading text-[22px] font-extrabold tracking-[-0.03em]">{nombre} ya está en vita</div>
        <p className="max-w-[300px] text-pretty text-[13.5px] font-medium leading-[1.45] text-slate-brand">
          Usa el modo simple en su celular. Le llegan los avisos de cada remedio y vos te enterás si no lo toma.
        </p>
        <button
          type="button"
          onClick={verRutina}
          disabled={yendo}
          className="mt-3 w-full rounded-full bg-primary py-[15px] font-heading text-[14.5px] font-extrabold text-primary-foreground shadow-cta disabled:opacity-60"
        >
          Ver su rutina
        </button>
      </div>
    );
  }

  return (
    <>
      {codigo ? (
        <PanelCodigoAcceso codigo={codigo.codigo} expiraAt={codigo.expiraAt} nombre={nombre} onGenerarOtro={generar} generando={generando} />
      ) : (
        <div className="rounded-[22px] bg-card p-[22px] text-center shadow-card">
          {error ? (
            <>
              <p className="text-[13px] font-medium text-destructive">{error}</p>
              <button
                type="button"
                onClick={generar}
                className="mt-3 rounded-full bg-primary px-5 py-[11px] font-heading text-[13.5px] font-extrabold text-primary-foreground"
              >
                Probar de nuevo
              </button>
            </>
          ) : (
            <p className="text-[13px] font-semibold text-subtle">Generando el código…</p>
          )}
        </div>
      )}

      <section>
        <h2 className="eyebrow px-1 pb-2.5 text-subtle">Qué tiene que hacer {nombre}</h2>
        <ol className="overflow-hidden rounded-[20px] bg-card shadow-card">
          {[
            "Abre vita en su celular",
            "Toca «Tengo un código»",
            `Escribe estos 6 números y confirma que es ${nombre}`,
          ].map((texto, i) => (
            <li key={i} className={"flex items-center gap-3 px-4 py-3.5 " + (i > 0 ? "border-t border-foreground/[0.06]" : "")}>
              <span className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-persona-violeta-tint font-heading text-[13px] font-extrabold text-persona-violeta-deep">
                {i + 1}
              </span>
              <span className="text-pretty text-[14.5px] font-bold leading-[1.35]">{texto}</span>
            </li>
          ))}
        </ol>
      </section>

      {esperando && (
        <div className="flex items-center gap-2.5 rounded-[18px] bg-card px-4 py-3.5 shadow-item">
          <span aria-hidden className="size-2.5 shrink-0 animate-pulse rounded-full bg-aviso motion-reduce:animate-none" />
          <span className="text-[13px] font-bold">Esperando que {nombre} entre…</span>
        </div>
      )}

      <p className="px-1 text-pretty text-[12px] font-medium leading-[1.45] text-subtle">
        El código vence en {MINUTOS_VIGENCIA_CODIGO_ACCESO} minutos y sirve una sola vez.
        {!yaConectado && ` Cuando ${nombre} entre, te lo mostramos acá.`}
      </p>
    </>
  );
}
