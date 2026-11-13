"use client";

import { useState } from "react";
import { VitaIcon } from "@/lib/vita-icons";
import { cn } from "@/lib/utils";
import { MOTIVOS_VALORACION, type ValorValoracion } from "@/lib/chat/valoraciones";
import { valorarRespuestaAction } from "./chat-actions";

// 👍/👎 bajo una respuesta de vita ya guardada (migración 060). Optimista: el estado cambia al tocar y vuelve atrás si el
// servidor no pudo guardar. Si la tabla no existe (060 sin aplicar) los botones se esconden. Nunca se guarda texto del mensaje.
export function ValoracionRespuesta({ mensajeId }: { mensajeId: string }) {
  const [valor, setValor] = useState<ValorValoracion | null>(null);
  const [motivo, setMotivo] = useState<string | null>(null);
  const [eligiendoMotivo, setEligiendoMotivo] = useState(false);
  const [oculto, setOculto] = useState(false);

  if (oculto) return null;

  async function guardar(nuevo: ValorValoracion | null, nuevoMotivo: string | null) {
    const previo = { valor, motivo };
    setValor(nuevo);
    setMotivo(nuevoMotivo);
    try {
      const r = await valorarRespuestaAction(mensajeId, nuevo ?? 0, nuevoMotivo ?? undefined);
      if (r.status === "error") {
        if (r.noDisponible) setOculto(true);
        else {
          setValor(previo.valor);
          setMotivo(previo.motivo);
        }
      }
    } catch {
      setValor(previo.valor);
      setMotivo(previo.motivo);
    }
  }

  function tocar(v: ValorValoracion) {
    if (valor === v) {
      setEligiendoMotivo(false);
      void guardar(null, null);
      return;
    }
    setEligiendoMotivo(v === -1);
    void guardar(v, null);
  }

  function elegirMotivo(m: string) {
    setEligiendoMotivo(false);
    void guardar(-1, m);
  }

  const base = "flex size-8 items-center justify-center rounded-full transition-colors motion-reduce:transition-none";
  return (
    <div className="pl-9">
      <div className="flex items-center gap-1" role="group" aria-label="Valorar la respuesta">
        <button
          type="button"
          aria-label="Me sirvió"
          aria-pressed={valor === 1}
          onClick={() => tocar(1)}
          className={cn(base, valor === 1 ? "bg-primary text-primary-foreground" : "text-subtle hover:bg-secondary")}
        >
          <VitaIcon name="thumbs-up" size={15} />
        </button>
        <button
          type="button"
          aria-label="No me sirvió"
          aria-pressed={valor === -1}
          onClick={() => tocar(-1)}
          className={cn(base, valor === -1 ? "bg-primary text-primary-foreground" : "text-subtle hover:bg-secondary")}
        >
          <VitaIcon name="thumbs-down" size={15} />
        </button>
        {valor === -1 && motivo && <span className="text-[12px] font-semibold text-subtle">{motivo}</span>}
      </div>
      {eligiendoMotivo && valor === -1 && (
        <div className="mt-1 flex flex-wrap gap-1.5" role="group" aria-label="Motivo">
          {MOTIVOS_VALORACION.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => elegirMotivo(m)}
              className="rounded-full bg-card px-3 py-1.5 text-[12.5px] font-bold text-teal-deep shadow-[inset_0_0_0_1px_var(--teal-100)]"
            >
              {m}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
