"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { VMark } from "@/components/vita/v-mark";
import { VitaIcon } from "@/lib/vita-icons";
import { reclamarCodigoAction, type EstadoReclamoCodigo } from "../actions";

const ESTADO_INICIAL: EstadoReclamoCodigo = { status: "idle" };

// "¿Alguien de tu familia te está ayudando con la app?" — si trae
// `?codigo=` (del deep link del QR de /onboarding/vincular-cuidado), abre
// directo la sub-vista de código con el campo pre-cargado. `abrirCodigoInicial`
// (desde `?modo=codigo`, el link "Me invitó un familiar..." de /login) abre
// la misma sub-vista pero sin pre-cargar nada.
export function PantallaInicio({
  codigoInicial,
  abrirCodigoInicial,
}: {
  codigoInicial?: string;
  abrirCodigoInicial?: boolean;
}) {
  const [mostrarCodigo, setMostrarCodigo] = useState(Boolean(codigoInicial) || Boolean(abrirCodigoInicial));

  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col overflow-hidden bg-gradient-to-b from-[#f8fbfc] to-white px-7 pb-8 pt-16">
      <div
        className="pointer-events-none absolute left-1/2 top-[-140px] size-[340px] -translate-x-1/2 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(8,145,178,0.12), transparent 60%)" }}
      />

      <div className="z-10 flex justify-center">
        <div className="flex size-16 items-center justify-center overflow-hidden rounded-full shadow-[0_14px_36px_rgba(8,145,178,0.28)]">
          <div className="flex size-full items-center justify-center" style={{ background: "linear-gradient(135deg, #22d3ee, #0e7490)" }}>
            <VMark size={42} />
          </div>
        </div>
      </div>

      <div className="z-10 mt-7.5 text-center">
        <div className="font-heading text-[26px] font-extrabold tracking-tight">Hola</div>
        <div className="mt-1.5 text-sm text-muted-foreground">
          ¿Alguien de tu familia te está ayudando con la app?
        </div>
      </div>

      <div className="z-10 mt-8 flex-1">
        {mostrarCodigo ? (
          <FormularioCodigo codigoInicial={codigoInicial} onVolver={() => setMostrarCodigo(false)} />
        ) : (
          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              onClick={() => setMostrarCodigo(true)}
              className="flex items-center gap-3 rounded-[20px] bg-card p-4 text-left shadow-[var(--shadow-card,0_8px_24px_rgba(15,33,54,0.06))]"
            >
              <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
                <VitaIcon name="link" size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-heading text-[15px] font-bold">Sí, tengo un código</div>
                <div className="mt-0.5 text-[12.5px] text-muted-foreground">Me lo compartieron por WhatsApp o QR</div>
              </div>
              <VitaIcon name="chevron-right" size={16} className="text-muted-foreground" />
            </button>

            <NoEsParaMiBoton />
          </div>
        )}
      </div>
    </div>
  );
}

function NoEsParaMiBoton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.push("/onboarding/para-quien")}
      className="h-14 w-full rounded-full font-heading text-[15px] font-bold text-white transition-opacity"
      style={{ background: "linear-gradient(135deg, var(--primary), #0e7490)" }}
    >
      No, es para mí
    </button>
  );
}

function FormularioCodigo({ codigoInicial, onVolver }: { codigoInicial?: string; onVolver: () => void }) {
  const [codigo, setCodigo] = useState(codigoInicial ?? "");
  const [estado, formAction, pendiente] = useActionState(reclamarCodigoAction, ESTADO_INICIAL);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input
        name="codigo"
        value={codigo}
        onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
        inputMode="numeric"
        autoFocus
        placeholder="000000"
        className="h-16 w-full rounded-[20px] bg-card text-center font-heading text-[26px] font-extrabold tracking-[0.3em] shadow-[var(--shadow-card,0_8px_24px_rgba(15,33,54,0.06))] outline-none"
      />

      {estado.status === "error" && (
        <div className="flex items-start gap-2.5 rounded-[16px] bg-destructive/10 px-3.5 py-3 text-sm text-destructive">
          <VitaIcon name="alert-triangle" size={18} className="mt-0.5 shrink-0" />
          <span>{estado.mensaje}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={codigo.length !== 6 || pendiente}
        className="h-14 w-full rounded-full font-heading text-[15px] font-bold text-white transition-opacity disabled:opacity-55"
        style={{ background: "linear-gradient(135deg, var(--primary), #0e7490)" }}
      >
        {pendiente ? "Verificando…" : "Continuar"}
      </button>

      <button
        type="button"
        onClick={onVolver}
        className="self-center text-sm font-semibold text-muted-foreground"
      >
        Mejor sigo sin código
      </button>
    </form>
  );
}
