"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { VitaIcon } from "@/lib/vita-icons";

// Aviso de "Sin conexión" (V7 estados del sistema): una barra oscura arriba de
// cada pantalla de /app/* mientras el navegador reporta que no hay red. Es
// honesta: vita no encola cambios sin conexión, así que no promete guardarlos.
function suscribir(avisar: () => void) {
  window.addEventListener("online", avisar);
  window.addEventListener("offline", avisar);
  return () => {
    window.removeEventListener("online", avisar);
    window.removeEventListener("offline", avisar);
  };
}

export function BarraSinConexion({ grande = false }: { grande?: boolean } = {}) {
  const router = useRouter();
  const enLinea = useSyncExternalStore(
    suscribir,
    () => navigator.onLine,
    () => true
  );
  const [conectando, setConectando] = useState(false);

  if (enLinea) return null;

  async function reintentar() {
    setConectando(true);
    try {
      const r = await fetch("/manifest.webmanifest", { method: "HEAD", cache: "no-store" });
      if (r.ok) {
        toast.success("Conexión de nuevo");
        router.refresh();
      } else {
        toast.error("Todavía no hay conexión.");
      }
    } catch {
      toast.error("Todavía no hay conexión.");
    } finally {
      setConectando(false);
    }
  }

  if (grande) {
    // Modo simple (V7 "offline"): letra grande y sin botones chicos.
    return (
      <div role="status" className="mt-1.5 flex items-center gap-3.5 rounded-[24px] bg-foreground px-[18px] py-4 text-primary-foreground">
        <VitaIcon name="wifi-off" size={30} className="shrink-0" />
        <div className="min-w-0">
          <div className="text-pretty text-[19px] font-bold leading-[1.35]">Sin internet</div>
          <div className="mt-1 text-pretty text-[16px] font-semibold leading-[1.35] text-primary-foreground/75">
            Podés ver lo que ya cargó. Para confirmar la toma hace falta conexión.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div role="status" className="mx-[18px] mb-1 mt-1 flex items-center gap-[11px] rounded-[18px] bg-foreground py-[11px] pl-3.5 pr-3 text-primary-foreground">
      <VitaIcon name="wifi-off" size={20} className="shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-extrabold">{conectando ? "Conectando…" : "Sin conexión"}</div>
        <div className="mt-px text-pretty text-[11.5px] font-medium leading-[1.4] text-primary-foreground/70">
          Podés mirar lo que ya cargó. Para guardar cambios hace falta conexión.
        </div>
      </div>
      <button
        type="button"
        onClick={reintentar}
        disabled={conectando}
        className="shrink-0 rounded-full bg-primary-foreground/[0.12] px-3 py-2 text-[12.5px] font-extrabold disabled:opacity-60"
      >
        {conectando ? "…" : "Reintentar"}
      </button>
    </div>
  );
}
