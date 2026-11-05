"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { VitaAvatar } from "@/components/vita/vita-avatar";
import { accionPermiso, ESPERA_PERMISO_MS, pedirPermisoYSeguir } from "./vista";
import { TEXTO_IOS, useNotificacionesPush } from "@/components/vita/activar-notificaciones";
import { VitaIcon } from "@/lib/vita-icons";

export function PantallaPermiso({
  destino,
  cuida,
  sinAhoraNo,
}: {
  destino: string;
  cuida: boolean;
  /** Llegó desde una invitación: los avisos son parte de cuidar, no se ofrece saltearlos. */
  sinAhoraNo?: boolean;
}) {
  const router = useRouter();
  const { estado, pendiente, activar } = useNotificacionesPush();

  // Con invitación: tocó "Permitir avisos" y va a seguir sola, responda lo que responda.
  const [siguiendo, setSiguiendo] = useState(false);
  // Con invitación: la carga inicial no resolvió a tiempo y el botón seguiría deshabilitado.
  const [cargaTrabada, setCargaTrabada] = useState(false);
  useEffect(() => {
    if (!sinAhoraNo) return;
    const temporizador = setTimeout(() => setCargaTrabada(true), ESPERA_PERMISO_MS);
    return () => clearTimeout(temporizador);
  }, [sinAhoraNo]);

  const continuar = () => router.push(destino);

  // Mientras sigue, se mantiene este botón para que no aparezca "Continuar" antes de navegar.
  const accion = siguiendo ? "permitir" : accionPermiso(estado, !!sinAhoraNo, cargaTrabada);

  function permitir() {
    if (!sinAhoraNo) {
      void activar();
      return;
    }
    setSiguiendo(true);
    void pedirPermisoYSeguir(activar, continuar);
  }

  const sub = cuida
    ? "Te aviso a la hora de cada remedio y turno. Si la persona que cuidás no confirma, te enterás."
    : "Te aviso a la hora de cada remedio y turno, así no se te pasa nada.";

  const nota =
    estado === "ios-instalar"
      ? TEXTO_IOS
      : estado === "bloqueado"
        ? "Los avisos están bloqueados en este navegador. Podés habilitarlos desde los ajustes del sitio."
        : estado === "no-soportado"
          ? "Este navegador no permite avisos."
          : null;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-cream px-6 pb-10 pt-16">
      <div className="flex flex-1 flex-col items-center justify-center">
        <div className="relative">
          <div className="flex size-[150px] items-center justify-center overflow-hidden rounded-full bg-avatar-fondo">
            <VitaAvatar size={136} estado="happy" />
          </div>
          <div className="absolute bottom-1.5 right-0.5 flex size-[46px] items-center justify-center rounded-full border-4 border-cream bg-primary text-primary-foreground">
            <VitaIcon name="bell" size={22} />
          </div>
        </div>
        <h1 className="mt-[26px] text-balance text-center font-heading text-[30px] font-extrabold leading-[1.15] tracking-[-0.04em]">
          ¿Te aviso cuando haya que tomar algo?
        </h1>
        <p className="mt-3 text-balance text-center text-[17px] font-medium leading-normal text-slate-brand">
          {estado === "activo" ? "Listo, vas a recibir los avisos en este celular." : sub}
        </p>
        {nota && <p className="mt-4 text-balance rounded-[var(--radius-item)] bg-card p-3.5 text-center text-sm font-medium text-slate-brand shadow-card">{nota}</p>}
      </div>

      <div className="flex flex-col gap-2">
        {accion === "permitir" ? (
          <>
            <button
              type="button"
              onClick={permitir}
              disabled={pendiente || siguiendo || estado === "cargando"}
              className="h-[60px] rounded-full bg-primary font-heading text-lg font-extrabold text-primary-foreground shadow-cta transition-transform active:scale-[0.98] disabled:opacity-60"
            >
              {pendiente || siguiendo ? "Activando…" : "Permitir avisos"}
            </button>
            {!sinAhoraNo && (
              <button type="button" onClick={continuar} className="h-[52px] text-base font-bold text-slate-brand">
                Ahora no
              </button>
            )}
          </>
        ) : (
          <button
            type="button"
            onClick={continuar}
            className="h-[60px] rounded-full bg-primary font-heading text-lg font-extrabold text-primary-foreground shadow-cta transition-transform active:scale-[0.98]"
          >
            Continuar
          </button>
        )}
      </div>
    </div>
  );
}
