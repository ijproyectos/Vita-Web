import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { obtenerPreferencias } from "@/lib/notificaciones/avisos";
import { ActivarNotificaciones } from "@/components/vita/activar-notificaciones";
import { Grupo } from "@/app/app/perfil/filas";
import { TopBar } from "@/app/app/top-bar";
import { FormularioConfigAvisos } from "./formulario";

// V7 "avisos-cfg": qué avisos recibir, cuánto esperar antes de avisarle a quien
// te cuida y el silencio de noche. Guarda en `preferencias_avisos`; el cron
// (lib/notificaciones/programados.ts) lee esas preferencias.
export default async function ConfigurarAvisosPage() {
  const usuario = await requireUser();
  const supabase = await createClient();
  const preferencias = await obtenerPreferencias(supabase, usuario.id);

  return (
    <div className="flex flex-col gap-[18px] px-[18px] pb-8 pt-1.5">
      <TopBar eyebrow="Avisos" title="Configurar avisos" />
      <Grupo>
        <ActivarNotificaciones variante="perfil" />
      </Grupo>
      <FormularioConfigAvisos inicial={preferencias} />
    </div>
  );
}
