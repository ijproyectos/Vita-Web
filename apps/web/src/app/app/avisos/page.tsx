import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { fechaEnAR as fechaAR, horaEnAR as horaAR } from "@/lib/medicamentos/nucleo";
import { createClient } from "@/lib/supabase/server";
import * as medicamentos from "@/lib/medicamentos/nucleo";
import * as perfilNucleo from "@/lib/perfil/nucleo";
import * as inventarioNucleo from "@/lib/inventario/nucleo";
import { AvisoStockBajo } from "@/components/vita/aviso-stock-bajo";
import { AvisoRecordatorio } from "@/components/vita/aviso-recordatorio";
import { listarRecordatoriosPendientes } from "@/lib/notificaciones/recordatorios";
import { listarAvisos } from "@/lib/notificaciones/avisos";
import { listarFamilia } from "@/lib/familia/nucleo";
import { colorPorDefecto } from "@/lib/familia/colores";
import { VitaIcon } from "@/lib/vita-icons";
import { fechaDeHoyISO, formatoFechaCorta } from "@/lib/rutina/formato";
import { TarjetaAvisosApagados } from "@/components/vita/tarjeta-avisos-apagados";
import { TopBar } from "../top-bar";
import { ListaAvisos, type ItemAviso, type PersonaAvisos } from "./lista-avisos";

const ZONA = "America/Argentina/Buenos_Aires";

function diaCorto(d: Date): string {
  return new Intl.DateTimeFormat("es-AR", { timeZone: ZONA, day: "numeric", month: "short" }).format(d).replace(".", "");
}

// Centro de notificaciones (V7 "avisos"): historial de lo que vita te avisó
// (tabla `avisos`, la escribe el cron) con filtro Todos / {Persona} / Vos y
// grupos por persona (los avisos de una persona cuidada tienen persona_id), más lo que ya
// existía como banners vivos — recordatorios de un familiar y stock bajo.
export default async function AvisosPage() {
  const usuario = await requireUser();
  const supabase = await createClient();

  const [medsHoy, inventarios, avisos, familia, nombrePropio] = await Promise.all([
    medicamentos.listarHoy(supabase, usuario.id),
    inventarioNucleo.listarSeguro(supabase, usuario.id),
    listarAvisos(supabase, usuario.id),
    listarFamilia(supabase),
    perfilNucleo.obtenerNombre(supabase, usuario.id),
  ]);
  const recordatorios = await listarRecordatoriosPendientes(supabase, usuario.id, medsHoy);
  const stockBajo = inventarioNucleo.filtrarStockBajo(inventarios);

  const hoy = fechaAR(new Date());
  const items: ItemAviso[] = avisos.map((a) => {
    const creado = new Date(a.created_at);
    return {
      id: a.id,
      tipo: a.tipo,
      titulo: a.titulo,
      cuerpo: a.cuerpo,
      url: a.url,
      leido: a.leido_at !== null,
      cuando: fechaAR(creado) === hoy ? horaAR(creado) : `${diaCorto(creado)} · ${horaAR(creado)}`,
      personaId: a.persona_id,
      atencion: a.datos?.tono === "ambar",
    };
  });
  const personas: PersonaAvisos[] = familia.map((p, i) => ({
    id: p.id,
    nombre: p.nombre,
    relacion: p.relacion,
    color: p.color ?? colorPorDefecto(i),
  }));
  const hayNoLeidos = avisos.some((a) => a.leido_at === null);

  return (
    <div className="flex flex-col gap-[18px] px-[18px] pb-8 pt-1.5">
      <TopBar volverA="/app"
        eyebrow={`Hoy · ${formatoFechaCorta(fechaDeHoyISO())}`}
        title="Avisos"
        accionDerecha={
          <Link
            href="/app/avisos/configuracion"
            aria-label="Configurar avisos"
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-card text-slate-brand shadow-card transition-transform active:scale-[0.94] motion-reduce:transition-none"
          >
            <VitaIcon name="sliders" size={18} strokeWidth={1.9} />
          </Link>
        }
      />
      <TarjetaAvisosApagados />
      <AvisoRecordatorio items={recordatorios} href="/app/modo-simple" />
      <AvisoStockBajo items={stockBajo} href="/app/pastillas" />
      <ListaAvisos
        items={items}
        personas={personas}
        nombreUsuario={nombrePropio}
        hayNoLeidos={hayNoLeidos}
        hayOtrosAvisos={recordatorios.length > 0 || stockBajo.length > 0}
      />
      <Link
        href="/app/avisos/configuracion"
        className="self-center rounded-full px-3 py-2 text-[13px] font-bold text-teal-deep"
      >
        Configurar avisos
      </Link>
    </div>
  );
}
