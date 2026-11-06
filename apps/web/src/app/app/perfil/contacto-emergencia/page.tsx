import { requireUser } from "@/lib/dal";
import { rutaVolverAPerfil } from "@/lib/familia/solo-mirar";
import { createClient } from "@/lib/supabase/server";
import * as perfilNucleo from "@/lib/perfil/nucleo";
import { COLUMNAS_025 } from "@/lib/perfil/tipos";
import { obtenerPerfilActivo } from "@/lib/familia/perfil-activo";
import { BannerPerfil } from "@/components/vita/banner-perfil";
import { TopBar } from "../../top-bar";
import { FormularioContacto } from "./formulario";

// Contacto de emergencia (V7): a quién avisar / llamar. Alimenta el botón
// Ayuda del modo simple.
export default async function ContactoEmergenciaPage() {
  await requireUser();
  const supabase = await createClient();
  const activo = await obtenerPerfilActivo();
  const perfil = await perfilNucleo.obtenerPerfil(supabase, activo.id).catch(() => null);

  return (
    <div className="flex flex-col gap-5 px-[18px] pb-10 pt-1.5">
      <TopBar volverA={rutaVolverAPerfil(activo)} eyebrow="Preferencias" title="Contacto de emergencia" />
      <BannerPerfil perfil={activo} />
      <p className="px-0.5 text-pretty text-[13.5px] font-medium leading-[1.5] text-slate-brand">
        {activo.esPropio
          ? "Es la persona a la que llama el botón Ayuda del modo simple. Cargá su nombre y su teléfono."
          : `Contacto de emergencia de ${activo.nombre}: es a quien llama el botón Ayuda de su modo simple. Cargá su nombre y su teléfono.`}
      </p>
      <FormularioContacto
        inicial={{
          nombre: perfil?.contacto_emergencia_nombre ?? "",
          relacion: perfil?.contacto_emergencia_relacion ?? "",
          telefono: perfil?.contacto_emergencia_telefono ?? "",
        }}
        conRelacion={!!perfil && COLUMNAS_025.every((c) => c in perfil)}
        soloLectura={activo.rol !== "editar"}
      />
    </div>
  );
}
