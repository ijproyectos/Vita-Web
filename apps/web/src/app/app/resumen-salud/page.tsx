import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import * as perfilNucleo from "@/lib/perfil/nucleo";
import { esEmailDeCuentaPorCodigo } from "@/lib/acceso-codigo/tipos";
import { TopBar } from "../top-bar";
import { ResumenSaludView } from "./resumen-salud-view";
import { obtenerPerfilActivo } from "@/lib/familia/perfil-activo";
import { BannerPerfil } from "@/components/vita/banner-perfil";

export default async function ResumenSaludPage() {
  const usuario = await requireUser();
  const supabase = await createClient();
  // Familia: el resumen es del perfil activo; con permiso "ver" es de solo lectura.
  const activo = await obtenerPerfilActivo();
  const perfil = await perfilNucleo.obtenerPerfil(supabase, activo.id);

  if (!perfil) return null; // requireUser ya garantiza sesión; perfiles se crea en el callback de auth

  return (
    <div className="flex flex-col gap-[22px] px-[18px] pt-1.5">
      <TopBar eyebrow="Perfil" title="Resumen de salud" />
      <BannerPerfil perfil={activo} />
      <ResumenSaludView
        perfil={perfil}
        color={activo.color}
        esPropio={activo.esPropio}
        soloLectura={activo.rol !== "editar"}
        email={
          !activo.esPropio
            ? "Perfil de tu familia"
            : esEmailDeCuentaPorCodigo(usuario.email)
              ? "Cuenta vinculada con tu familiar"
              : (usuario.email ?? "")
        }
      />
    </div>
  );
}
