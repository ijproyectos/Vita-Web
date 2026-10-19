import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import * as medicamentos from "@/lib/medicamentos/nucleo";
import * as inventarioNucleo from "@/lib/inventario/nucleo";
import { AvisoStockBajo } from "@/components/vita/aviso-stock-bajo";
import { AvisoRecordatorio } from "@/components/vita/aviso-recordatorio";
import { listarRecordatoriosPendientes } from "@/lib/notificaciones/recordatorios";
import { VitaIcon } from "@/lib/vita-icons";
import { TopBar } from "../top-bar";

// Avisos (campana de Home). Hoy junta lo que ya existe: recordatorios de un
// familiar y stock bajo. TODO(fase avisos): centro de notificaciones con
// historial cuando exista su backend.
export default async function AvisosPage() {
  const usuario = await requireUser();
  const supabase = await createClient();

  const [medsHoy, inventarios] = await Promise.all([
    medicamentos.listarHoy(supabase, usuario.id),
    inventarioNucleo.listarSeguro(supabase, usuario.id),
  ]);
  const recordatorios = await listarRecordatoriosPendientes(supabase, usuario.id, medsHoy);
  const stockBajo = inventarioNucleo.filtrarStockBajo(inventarios);
  const vacio = recordatorios.length === 0 && stockBajo.length === 0;

  return (
    <div className="flex flex-col gap-[18px] px-[18px] pt-1.5">
      <TopBar eyebrow="Novedades" title="Avisos" />
      <AvisoRecordatorio items={recordatorios} href="/app/modo-simple" />
      <AvisoStockBajo items={stockBajo} href="/app/pastillas" />
      {vacio && (
        <div className="flex flex-col items-center gap-2 rounded-[20px] bg-card px-5 pb-[22px] pt-[26px] text-center shadow-card">
          <div className="flex size-12 items-center justify-center rounded-full bg-persona-1-tint text-persona-1">
            <VitaIcon name="bell" size={22} />
          </div>
          <div className="mt-0.5 font-heading text-[15px] font-extrabold tracking-[-0.02em]">No hay avisos por ahora</div>
          <div className="max-w-[280px] text-[12.5px] font-medium leading-[1.45] text-subtle text-balance">
            Cuando haya un recordatorio de un familiar o te queden pocas pastillas, lo ves acá.
          </div>
        </div>
      )}
    </div>
  );
}
