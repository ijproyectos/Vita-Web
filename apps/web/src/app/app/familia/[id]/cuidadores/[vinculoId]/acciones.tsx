"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ETIQUETA_ROL, type RolVinculo } from "@/lib/familia/tipos";
import { TarjetasPermiso } from "@/components/vita/tarjetas-permiso";
import { cambiarRolCuidadorAction, quitarCuidadorAction, reenviarInvitacionAction } from "../../../actions";

export function AccionesCuidador({
  personaId,
  personaNombre,
  vinculoId,
  nombre,
  rolInicial,
  pendiente,
  puedeGestionar,
  administraCuidadores,
  venceEl,
  tieneLink,
}: {
  personaId: string;
  personaNombre: string;
  vinculoId: string;
  nombre: string;
  rolInicial: RolVinculo;
  pendiente: boolean;
  puedeGestionar: boolean;
  administraCuidadores: boolean;
  venceEl: string | null;
  tieneLink: boolean;
}) {
  const router = useRouter();
  const [rol, setRol] = useState<RolVinculo>(rolInicial);
  const [confirmando, setConfirmando] = useState(false);
  const [pendienteAccion, startTransition] = useTransition();

  function elegir(nuevo: RolVinculo) {
    if (nuevo === rol || !puedeGestionar) return;
    const anterior = rol;
    setRol(nuevo);
    startTransition(async () => {
      try {
        const r = await cambiarRolCuidadorAction(vinculoId, nuevo);
        if (r.status === "error") {
          setRol(anterior);
          toast.error(r.message);
          return;
        }
        toast.success(`Ahora es ${ETIQUETA_ROL[nuevo].titulo}`);
        router.refresh();
      } catch {
        setRol(anterior);
        toast.error("No pudimos cambiar el permiso.");
      }
    });
  }

  function quitar() {
    startTransition(async () => {
      try {
        const r = await quitarCuidadorAction(vinculoId, personaId);
        if (r.status === "error") {
          toast.error(r.message);
          return;
        }
        toast.success(pendiente ? "Invitación cancelada" : `${nombre} ya no cuida a ${personaNombre}`);
        router.push("/app/familia");
        router.refresh();
      } catch {
        toast.error("No pudimos quitarlo.");
      }
    });
  }

  function reenviar() {
    startTransition(async () => {
      try {
        const r = await reenviarInvitacionAction(personaId, vinculoId);
        if (r.status === "error") toast.error(r.message);
        else toast.success(`Le reenviamos la invitación a ${nombre}`);
      } catch {
        toast.error("No pudimos reenviar la invitación.");
      }
    });
  }

  return (
    <>
      {pendiente && (
        <div className="flex items-center gap-3 rounded-[20px] bg-aviso-panel px-4 py-3.5">
          <div className="min-w-0 flex-1">
            <div className="font-heading text-sm font-extrabold tracking-[-0.02em] text-aviso-panel-ink">Todavía no aceptó</div>
            <div className="mt-0.5 text-[11.5px] font-medium text-aviso-panel-ink/80">
              {venceEl ? `La invitación vence el ${new Date(venceEl).toLocaleDateString("es-AR", { day: "numeric", month: "long" })}` : "La invitación está pendiente"}
            </div>
          </div>
          {puedeGestionar && tieneLink && (
            <button
              type="button"
              onClick={reenviar}
              disabled={pendienteAccion}
              className="shrink-0 rounded-full bg-card px-3.5 py-2 text-[12.5px] font-extrabold text-teal-deep disabled:opacity-60"
            >
              Reenviar
            </button>
          )}
        </div>
      )}

      <section>
        <h2 className="eyebrow px-1 pb-2.5 text-subtle">Permiso</h2>
        <TarjetasPermiso
          valor={rol}
          onChange={elegir}
          disabled={!puedeGestionar || pendienteAccion}
          etiqueta={`Permiso de ${nombre}`}
          puedeAdministrarCuidadores={administraCuidadores}
        />
        {!puedeGestionar && (
          <p className="px-1 pt-2.5 text-pretty text-[12.5px] font-medium leading-[1.45] text-subtle">
            El permiso lo cambia {personaNombre === "vos" ? "vos" : `${personaNombre} o un Admin de su perfil`}.
          </p>
        )}
      </section>

      {puedeGestionar &&
        (confirmando ? (
          <div className="flex flex-col gap-3 rounded-[20px] bg-destructive/[0.04] p-4 shadow-card">
            <div>
              <div className="font-heading text-[14.5px] font-extrabold tracking-[-0.02em]">
                {pendiente ? `¿Cancelar la invitación a ${nombre}?` : `¿Quitar a ${nombre}?`}
              </div>
              <div className="mt-0.5 text-pretty text-[11.5px] font-medium leading-[1.45] text-subtle">
                {pendiente
                  ? "El link que le mandaste deja de funcionar."
                  : `Deja de ver a ${personaNombre} y de recibir sus avisos. Lo que cargó queda guardado.`}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={quitar}
                disabled={pendienteAccion}
                className="flex-1 rounded-full bg-destructive py-[11px] font-heading text-[13.5px] font-extrabold text-primary-foreground disabled:opacity-60"
              >
                {pendienteAccion ? "Quitando…" : pendiente ? "Cancelar invitación" : "Quitar"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmando(false)}
                disabled={pendienteAccion}
                className="rounded-full bg-secondary px-[18px] py-[11px] font-heading text-[13.5px] font-bold text-slate-brand"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmando(true)}
            className="self-center px-4 py-2.5 text-sm font-bold text-destructive"
          >
            {pendiente ? "Cancelar la invitación" : `Quitar a ${nombre}`}
          </button>
        ))}
    </>
  );
}
