"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { VitaIcon } from "@/lib/vita-icons";
import { marcarAvisoLeidoAction } from "@/lib/notificaciones/actions";
import type { PedidoAyudaPendiente } from "@/lib/notificaciones/avisos";
import { parsearVistos, registrarVistos, vencidosTrasVerlos } from "@/lib/notificaciones/pedido-ayuda-visto";

const CLAVE_VISTOS = "vita_pedidos_ayuda_vistos";

function leerVistos() {
  try {
    return parsearVistos(window.localStorage.getItem(CLAVE_VISTOS));
  } catch {
    return {};
  }
}

const sinSuscripcion = () => () => {};

// "X pidió ayuda" en el Inicio de quien cuida, con el perfil que tenga elegido.
// Sale del mismo aviso del feed (tipo pedido_ayuda); la cruz lo marca leído.
// Sin botón "Ver": la ficha de la persona no tiene nada sobre el pedido.
// Una hora después de verla por primera vez (en este dispositivo) se va sola y
// el aviso queda leído en el servidor.
export function TarjetasPedidoAyuda({ pedidos }: { pedidos: PedidoAyudaPendiente[] }) {
  const [cerrados, setCerrados] = useState<Set<string>>(() => new Set());
  // En el servidor no hay localStorage: hasta montar no se sabe qué se vio.
  const montado = useSyncExternalStore(sinSuscripcion, () => true, () => false);
  const ids = pedidos.map((p) => p.id);
  const clave = ids.join(",");
  const vencidos = new Set(montado ? vencidosTrasVerlos(ids, leerVistos(), new Date().getTime()) : []);

  useEffect(() => {
    const lista = clave ? clave.split(",") : [];
    const ahora = new Date().getTime();
    const vistos = leerVistos();
    try {
      window.localStorage.setItem(CLAVE_VISTOS, JSON.stringify(registrarVistos(lista, vistos, ahora)));
    } catch {
      // sin storage: la tarjeta queda hasta que la cierren
    }
    for (const id of vencidosTrasVerlos(lista, vistos, ahora)) void marcarAvisoLeidoAction(id).catch(() => {});
  }, [clave]);

  const visibles = pedidos.filter((p) => !cerrados.has(p.id) && !vencidos.has(p.id));
  if (visibles.length === 0) return null;

  function cerrar(id: string) {
    setCerrados((prev) => new Set(prev).add(id));
    void marcarAvisoLeidoAction(id)
      .then((r) => {
        if (r.status === "error") throw new Error(r.message);
      })
      .catch(() => {
        setCerrados((prev) => {
          const sin = new Set(prev);
          sin.delete(id);
          return sin;
        });
        toast.error("No pudimos cerrar el aviso. Probá de nuevo.");
      });
  }

  return (
    <div className="flex flex-col gap-3">
      {visibles.map((p) => (
        <div key={p.id} role="alert" className="relative rounded-[var(--radius-card)] bg-destructive/10 p-[18px] pr-14 shadow-card">
          <button
            type="button"
            onClick={() => cerrar(p.id)}
            aria-label="Cerrar aviso"
            className="absolute right-2.5 top-2.5 flex size-11 items-center justify-center rounded-full text-destructive transition-transform active:scale-[0.94] motion-reduce:transition-none"
          >
            <VitaIcon name="close" size={20} strokeWidth={2.2} />
          </button>
          <div className="flex items-start gap-3.5">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-card text-destructive shadow-item" aria-hidden="true">
              <VitaIcon name="alert-triangle" size={22} strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <div className="eyebrow text-destructive">Pedido de ayuda · {p.hora}</div>
              <div className="mt-1 text-balance break-words font-heading text-[19px] font-extrabold leading-[1.2] tracking-[-0.02em]">
                {p.titulo}
              </div>
              {p.cuerpo && <div className="mt-1 text-pretty text-[13.5px] font-medium leading-[1.45] text-slate-brand">{p.cuerpo}</div>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
