"use client";

import { useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { VitaIcon } from "@/lib/vita-icons";
import { Interruptor } from "@/components/vita/interruptor";
import { Segmentado } from "@/components/vita/segmentado";
import { PinPantalla, type ModoPin } from "@/components/vita/pin-pantalla";
import {
  ESPERAS_PIN,
  guardarEspera,
  leerEspera,
  pinConfigurado,
  pinDisponible,
  quitarPin,
  suscribirPin,
  type EsperaPin,
} from "@/lib/seguridad/pin";

type Pantalla = { modo: ModoPin; vista?: boolean; quitar?: boolean } | null;

// Tarjeta "PIN al volver" de Seguridad (V7): activar/desactivar, cuánto
// esperar antes de pedirlo, cambiarlo y ver cómo se bloquea. El PIN es de ESTE
// dispositivo (ver lib/seguridad/pin.ts).
export function PinSeguridad({ uid, nombre }: { uid: string; nombre: string }) {
  const estado = useSyncExternalStore(
    suscribirPin,
    () => `${pinConfigurado(uid) ? 1 : 0}:${leerEspera(uid)}`,
    () => "0:0"
  );
  const activo = estado.startsWith("1");
  const espera = Number(estado.split(":")[1]) as EsperaPin;
  const disponible = useSyncExternalStore(
    () => () => {},
    () => pinDisponible(),
    () => true
  );
  const [pantalla, setPantalla] = useState<Pantalla>(null);

  function alternar(v: boolean) {
    if (v) setPantalla({ modo: "nuevo" });
    // Desactivarlo exige el PIN actual: alguien con el celular desbloqueado no lo borra.
    else setPantalla({ modo: "desbloquear", quitar: true });
  }

  return (
    <>
      <div className="overflow-hidden rounded-[20px] bg-card shadow-card">
        <div className="flex flex-col gap-3 px-4 py-[15px]">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="font-heading text-[14.5px] font-extrabold tracking-[-0.02em]">PIN al volver</div>
              <div className="mt-0.5 text-pretty text-[11.5px] font-medium leading-[1.4] text-subtle">
                {disponible
                  ? "Te pedimos un PIN de 4 números cada vez que volvés a abrir vita en este dispositivo."
                  : "Este navegador no permite guardar el PIN de forma segura (hace falta una conexión segura)."}
              </div>
            </div>
            <Interruptor activo={activo} onChange={alternar} label="PIN al volver" disabled={!disponible} />
          </div>
          {activo && (
            <div className="flex flex-col gap-2">
              <div className="eyebrow text-subtle">Pedirlo después de</div>
              <Segmentado
                etiqueta="Pedir el PIN después de"
                opciones={ESPERAS_PIN}
                valor={espera}
                onChange={(v) => guardarEspera(uid, v)}
              />
            </div>
          )}
        </div>
        {activo && (
          <>
            <button
              type="button"
              onClick={() => setPantalla({ modo: "cambiar" })}
              className="flex w-full items-center gap-3 border-t border-foreground/[0.06] px-4 py-[15px] text-left"
            >
              <span className="flex-1 font-heading text-[14.5px] font-extrabold tracking-[-0.02em]">Cambiar PIN</span>
              <VitaIcon name="chevron-right" size={18} className="shrink-0 text-faint" />
            </button>
            <button
              type="button"
              onClick={() => setPantalla({ modo: "desbloquear", vista: true })}
              className="flex w-full items-center gap-3 border-t border-foreground/[0.06] px-4 py-[15px] text-left"
            >
              <span className="min-w-0 flex-1">
                <span className="block font-heading text-[14.5px] font-extrabold tracking-[-0.02em]">Ver cómo se bloquea</span>
                <span className="mt-0.5 block text-[11.5px] font-medium text-subtle">Así se ve al volver a abrir vita</span>
              </span>
              <VitaIcon name="chevron-right" size={18} className="shrink-0 text-faint" />
            </button>
          </>
        )}
      </div>

      {pantalla && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-[150] overflow-y-auto bg-background">
          <div className="mx-auto w-full max-w-md">
            <PinPantalla
              uid={uid}
              nombre={nombre}
              modo={pantalla.modo}
              onCancelar={() => setPantalla(null)}
              onListo={(que) => {
                const eraCambio = pantalla.modo === "cambiar";
                const quitar = pantalla.quitar;
                setPantalla(null);
                if (quitar) {
                  quitarPin(uid);
                  toast.success("PIN desactivado");
                } else if (que === "nuevo") toast.success(eraCambio ? "PIN cambiado" : "Listo, tu PIN nuevo ya está activo");
              }}
              onAgotado={() => {
                setPantalla(null);
                toast.error("Demasiados intentos. Probá de nuevo en un momento.");
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}
