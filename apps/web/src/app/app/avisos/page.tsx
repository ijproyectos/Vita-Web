import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import * as medicamentos from "@/lib/medicamentos/nucleo";
import * as inventarioNucleo from "@/lib/inventario/nucleo";
import { AvisoStockBajo } from "@/components/vita/aviso-stock-bajo";
import { AvisoRecordatorio } from "@/components/vita/aviso-recordatorio";
import { listarRecordatoriosPendientes } from "@/lib/notificaciones/recordatorios";
import { listarAvisos } from "@/lib/notificaciones/avisos";
import { VitaIcon } from "@/lib/vita-icons";
import { TopBar } from "../top-bar";
import { ListaAvisos, type GrupoAvisos, type ItemAviso } from "./lista-avisos";

const ZONA = "America/Argentina/Buenos_Aires";

function fechaAR(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
function horaAR(d: Date): string {
  return new Intl.DateTimeFormat("es-AR", { timeZone: ZONA, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
}
function diaCorto(d: Date): string {
  return new Intl.DateTimeFormat("es-AR", { timeZone: ZONA, day: "numeric", month: "short" }).format(d).replace(".", "");
}

// Centro de notificaciones (V7 "avisos"): historial de lo que vita te avisó
// (tabla `avisos`, la escribe el cron) agrupado en Hoy / Antes, más lo que ya
// existía como banners vivos — recordatorios de un familiar y stock bajo.
export default async function AvisosPage() {
  const usuario = await requireUser();
  const supabase = await createClient();

  const [medsHoy, inventarios, avisos] = await Promise.all([
    medicamentos.listarHoy(supabase, usuario.id),
    inventarioNucleo.listarSeguro(supabase, usuario.id),
    listarAvisos(supabase, usuario.id),
  ]);
  const recordatorios = await listarRecordatoriosPendientes(supabase, usuario.id, medsHoy);
  const stockBajo = inventarioNucleo.filtrarStockBajo(inventarios);

  const hoy = fechaAR(new Date());
  const hoyItems: ItemAviso[] = [];
  const antesItems: ItemAviso[] = [];
  for (const a of avisos) {
    const creado = new Date(a.created_at);
    const esHoy = fechaAR(creado) === hoy;
    const item: ItemAviso = {
      id: a.id,
      tipo: a.tipo,
      titulo: a.titulo,
      cuerpo: a.cuerpo,
      url: a.url,
      leido: a.leido_at !== null,
      cuando: esHoy ? horaAR(creado) : `${diaCorto(creado)} · ${horaAR(creado)}`,
    };
    (esHoy ? hoyItems : antesItems).push(item);
  }
  const grupos: GrupoAvisos[] = [
    { titulo: "Hoy", items: hoyItems },
    { titulo: "Antes", items: antesItems },
  ].filter((g) => g.items.length > 0);
  const hayNoLeidos = avisos.some((a) => a.leido_at === null);
  const vacio = recordatorios.length === 0 && stockBajo.length === 0 && avisos.length === 0;

  return (
    <div className="flex flex-col gap-[18px] px-[18px] pb-8 pt-1.5">
      <TopBar
        eyebrow="Novedades"
        title="Avisos"
        accionDerecha={
          <Link
            href="/app/avisos/configuracion"
            aria-label="Configurar avisos"
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-card text-slate-brand shadow-card transition-transform active:scale-[0.94] motion-reduce:transition-none"
          >
            <VitaIcon name="settings" size={18} strokeWidth={2} />
          </Link>
        }
      />
      <AvisoRecordatorio items={recordatorios} href="/app/modo-simple" />
      <AvisoStockBajo items={stockBajo} href="/app/pastillas" />
      <ListaAvisos grupos={grupos} hayNoLeidos={hayNoLeidos} />
      {vacio && (
        <div className="flex flex-col items-center gap-2 rounded-[20px] bg-card px-5 pb-[22px] pt-[26px] text-center shadow-card">
          <div className="flex size-12 items-center justify-center rounded-full bg-persona-1-tint text-persona-1">
            <VitaIcon name="bell" size={22} />
          </div>
          <div className="mt-0.5 font-heading text-[15px] font-extrabold tracking-[-0.02em]">No hay avisos por ahora</div>
          <div className="max-w-[280px] text-[12.5px] font-medium leading-[1.45] text-subtle text-balance">
            Cuando sea la hora de una toma, tengas un turno o te queden pocas pastillas, te lo contamos acá.
          </div>
        </div>
      )}
      <Link
        href="/app/avisos/configuracion"
        className="self-center rounded-full px-3 py-2 text-[13px] font-bold text-teal-deep"
      >
        Configurar avisos
      </Link>
    </div>
  );
}
