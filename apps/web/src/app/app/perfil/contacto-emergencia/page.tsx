import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import * as familiaNucleo from "@/lib/familia/nucleo";
import { rutaVolverAPerfil } from "@/lib/familia/solo-mirar";
import { obtenerPerfilCacheado } from "@/lib/perfil/cacheado";
import { COLUMNAS_025 } from "@/lib/perfil/tipos";
import { obtenerPerfilActivo } from "@/lib/familia/perfil-activo";
import { BannerPerfil } from "@/components/vita/banner-perfil";
import { TopBar } from "../../top-bar";
import { FormularioContacto } from "./formulario";

// Contacto de emergencia (V7): a quién avisar / llamar. Alimenta el botón
// Ayuda del modo simple.
export default async function ContactoEmergenciaPage(props: PageProps<"/app/perfil/contacto-emergencia">) {
  await requireUser();
  const { persona } = await props.searchParams;
  const activo = await obtenerPerfilActivo();

  // Desde la ficha de una persona a cargo: se edita esa, sin cambiar el perfil activo.
  const supabase = await createClient();
  const familia = typeof persona === "string" ? await familiaNucleo.listarFamilia(supabase) : [];
  const ficha = familia.find((m) => m.id === persona && m.rol === "editar") ?? null;
  const volverFicha = ficha ? `/app/familia/${ficha.id}` : null;

  const perfil = await obtenerPerfilCacheado(ficha?.id ?? activo.id).catch(() => null);

  return (
    <div className="flex flex-col gap-5 px-[18px] pb-10 pt-1.5">
      <TopBar volverA={volverFicha ?? rutaVolverAPerfil(activo)} eyebrow="Preferencias" title="Contacto de emergencia" />
      {!ficha && <BannerPerfil perfil={activo} />}
      <p className="px-0.5 text-pretty text-[13.5px] font-medium leading-[1.5] text-slate-brand">
        {ficha
          ? `Contacto de emergencia de ${ficha.nombre.split(" ")[0]}: es a quien llama el botón Ayuda de su modo simple. Cargá su nombre y su teléfono.`
          : activo.esPropio
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
        soloLectura={ficha ? false : activo.rol !== "editar"}
        personaId={ficha?.id}
        volverA={volverFicha ?? undefined}
      />
    </div>
  );
}
