import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { esperaDePersona, obtenerPreferenciasConEstado } from "@/lib/notificaciones/avisos";
import { listarFamilia } from "@/lib/familia/nucleo";
import { ActivarNotificaciones } from "@/components/vita/activar-notificaciones";
import { Grupo } from "@/app/app/perfil/filas";
import { TopBar } from "@/app/app/top-bar";
import { FormularioConfigAvisos } from "./formulario";

// V7 "avisos-cfg": qué avisos recibir (los tuyos y, si cuidás a alguien, los de
// esa persona), cuánto esperar antes de avisarle a quien te cuida y el silencio
// de noche. Cada interruptor guarda al instante en `preferencias_avisos`; el
// cron (lib/notificaciones/programados.ts) lee esas preferencias.
export default async function ConfigurarAvisosPage() {
  const usuario = await requireUser();
  const supabase = await createClient();
  const [{ prefs, familiaDisponible }, familia] = await Promise.all([
    obtenerPreferenciasConEstado(supabase, usuario.id),
    listarFamilia(supabase),
  ]);

  // La espera antes de avisarle al cuidador es de la PERSONA; un Admin la edita.
  const admin = familia.find((p) => p.rol === "editar");
  const esperaPersona = admin ? await esperaDePersona(supabase, admin.id) : null;

  return (
    <div className="flex flex-col gap-[18px] px-[18px] pb-8 pt-1.5">
      <TopBar eyebrow="Avisos" title="Configurar avisos" />
      <Grupo>
        <ActivarNotificaciones variante="perfil" />
      </Grupo>
      <FormularioConfigAvisos
        inicial={prefs}
        personas={familiaDisponible ? familia.map((p) => ({ id: p.id, nombre: p.nombre, relacion: p.relacion })) : []}
        puedeEditarEspera={Boolean(admin)}
        esperaPersona={esperaPersona}
      />
    </div>
  );
}
