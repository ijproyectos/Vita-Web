import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { cargarVistaMemoria } from "@/lib/memoria/privacidad";
import { TopBar } from "../../../top-bar";
import { PantallaMemoria } from "./pantalla-memoria";

// Lo que vita recuerda de vos: ver, corregir, dejar de recordar, eliminar y apagar la memoria. Solo del dueño (RLS).
export default async function MemoriaPage() {
  const usuario = await requireUser();
  const supabase = await createClient();
  const vista = await cargarVistaMemoria(supabase, usuario.id);

  return (
    <div className="flex flex-col gap-[22px] px-[18px] pb-10 pt-1.5">
      <TopBar volverA="/app/perfil/privacidad" eyebrow="Privacidad y datos" title="Lo que vita recuerda de vos" />
      <PantallaMemoria vista={vista} />
    </div>
  );
}
