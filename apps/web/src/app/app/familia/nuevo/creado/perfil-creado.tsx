"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AvatarPersona } from "@/components/vita/avatar-persona";
import type { ColorPerfil } from "@/lib/familia/tipos";
import { cambiarPerfilActivoAction } from "../../actions";

// Confirmación después de "Crear un perfil": quien lo creó ya es Admin, así que
// no se le explican permisos. Solo se le ofrece lo que sigue.
export function PerfilCreado({ id, nombre, color }: { id: string; nombre: string; color: ColorPerfil }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();

  // El alta de medicamento usa el perfil activo. Se activa a esta persona antes
  // de abrirla, por si se volvió a esta pantalla después de cambiar de perfil.
  function cargarRemedios() {
    startTransition(async () => {
      const r = await cambiarPerfilActivoAction(id).catch(() => null);
      if (r?.status === "success") router.push("/app/agregar-medicamento");
      else toast.error(r?.message ?? "No pudimos abrir su perfil. Probá de nuevo.");
    });
  }

  return (
    <div className="flex flex-col items-center gap-[22px] px-[18px] pb-10 pt-12 text-center">
      <AvatarPersona nombre={nombre} color={color} size={72} />
      <div>
        <h1 className="text-balance font-heading text-[28px] font-extrabold leading-[1.15] tracking-[-0.04em]">
          Listo, creaste el perfil de {nombre}
        </h1>
        <p className="mt-2 text-pretty text-[15px] font-medium leading-[1.45] text-subtle">
          Queda a tu cargo. Ahora podés cargar sus remedios o invitar a alguien más para que te ayude.
        </p>
      </div>
      <div className="flex w-full flex-col gap-2.5">
        <button
          type="button"
          onClick={cargarRemedios}
          disabled={pendiente}
          className="rounded-full bg-primary py-[15px] font-heading text-sm font-extrabold text-primary-foreground disabled:opacity-60"
        >
          Cargar sus remedios
        </button>
        <Link
          href={`/app/familia/invitar?persona=${id}`}
          className="rounded-full bg-card py-[15px] font-heading text-sm font-extrabold text-foreground shadow-item"
        >
          Invitar a alguien más
        </Link>
      </div>
    </div>
  );
}
