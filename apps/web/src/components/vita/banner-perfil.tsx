import { AvatarPersona } from "@/components/vita/avatar-persona";
import { CLASES_COLOR } from "@/lib/familia/colores";
import type { PerfilActivo } from "@/lib/familia/tipos";
import { cn } from "@/lib/utils";

// Aviso de "estás viendo/cargando los datos de otra persona" (Familia). No se
// muestra para el propio perfil.
export function BannerPerfil({ perfil, accion = "ver" }: { perfil: PerfilActivo; accion?: "ver" | "cargar" }) {
  if (perfil.esPropio) return null;
  const soloVer = perfil.rol !== "editar";
  const clases = CLASES_COLOR[perfil.color];
  return (
    <div className={cn("flex items-center gap-3 rounded-[var(--radius-item)] p-3", clases.fondo)}>
      <AvatarPersona nombre={perfil.nombre} color={perfil.color} size={34} className="bg-card" />
      <div className="min-w-0 flex-1 text-[12.5px] font-semibold leading-[1.35]">
        <span className={clases.tinta}>
          {accion === "cargar" && !soloVer ? `Lo vas a cargar para ${perfil.nombre}.` : `Estás viendo a ${perfil.nombre}.`}
        </span>
        {soloVer && <span className="block font-medium text-slate-brand">Tenés permiso de solo ver: no podés cambiar nada.</span>}
      </div>
    </div>
  );
}
