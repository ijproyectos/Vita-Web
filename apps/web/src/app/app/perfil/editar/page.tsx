import { requireUser } from "@/lib/dal";
import { obtenerPerfilCacheado } from "@/lib/perfil/cacheado";
import { COLUMNAS_025 } from "@/lib/perfil/tipos";
import { obtenerPerfilActivo } from "@/lib/familia/perfil-activo";
import { BannerPerfil } from "@/components/vita/banner-perfil";
import { TopBar } from "../../top-bar";
import { FormularioEditarPerfil } from "./formulario";

// Editar perfil (V7): datos personales, medidas y cobertura, con un único
// "Guardar cambios". Edita el perfil activo (propio o de alguien a cargo).
export default async function EditarPerfilPage() {
  await requireUser();
  const activo = await obtenerPerfilActivo();
  const perfil = await obtenerPerfilCacheado(activo.id).catch(() => null);

  if (!perfil) return null;

  return (
    <div className="flex flex-col gap-6 px-[18px] pb-10 pt-1.5">
      <TopBar volverA="/app/perfil" eyebrow="Datos personales" title={activo.esPropio ? "Editar mi perfil" : `Editar a ${activo.nombre}`} />
      <BannerPerfil perfil={activo} accion="cargar" />
      <FormularioEditarPerfil
        perfil={perfil}
        conColumnasNuevas={COLUMNAS_025.every((c) => c in perfil)}
        soloLectura={activo.rol !== "editar"}
      />
    </div>
  );
}
