import Link from "next/link";
import { notFound } from "next/navigation";
import { TopBar } from "@/app/app/top-bar";
import { ListaAvisos, type ItemAviso, type PersonaAvisos } from "@/app/app/avisos/lista-avisos";
import { AccionesMiembro } from "@/app/app/familia/[id]/acciones";
import { HoyPendientes } from "@/app/app/familia/[id]/hoy-pendientes";
import { AvatarPersona } from "@/components/vita/avatar-persona";
import { payloadDosisVencida } from "@/lib/notificaciones/mensajes";
import { VitaIcon } from "@/lib/vita-icons";

// Preview WITHOUT login of the caregiver flow: Avisos -> tap "todavía no tomó" ->
// the person's card (no longer the old /cuidar screen). Sample data, inert buttons.
// Dev/test only: 404 in production unless NEXT_PUBLIC_ENABLE_TEST_LOGIN === "true".
// `?pantalla=avisos` (default) or `?pantalla=ficha`.

const JESUS = "00000000-0000-4000-8000-000000000001";

const aviso = payloadDosisVencida({
  elderId: JESUS,
  elderNombre: "Jesús",
  medicamentoId: "m1",
  nombre: "Amoxicilina",
  horaProgramada: "09:00",
  fechaAR: "2026-11-11",
  rolDestino: "editar",
});

const ITEMS: ItemAviso[] = [
  { id: "a1", tipo: "dosis_vencida_cuidador", titulo: aviso.body, cuerpo: "", url: aviso.url, leido: false, cuando: "09:35", personaId: JESUS, atencion: false },
  { id: "a2", tipo: "turno_persona_dia_antes", titulo: "Mañana Jesús tiene turno de Clínica médica", cuerpo: "A las 10:30 · Sanatorio Allende", url: `/app/familia/${JESUS}`, leido: true, cuando: "10 nov · 21:00", personaId: JESUS, atencion: false },
  { id: "a3", tipo: "dosis", titulo: "Hora de tu Enalapril 10 mg", cuerpo: "", url: "/app/modo-simple", leido: true, cuando: "10 nov · 08:00", personaId: null, atencion: false },
];

const PERSONAS: PersonaAvisos[] = [{ id: JESUS, nombre: "Jesús", relacion: "Papá", color: "violeta" }];

function PantallaAvisos() {
  return (
    <div className="flex flex-col gap-[18px] px-[18px] pb-8 pt-1.5">
      <TopBar volverA="/app" eyebrow="Hoy · mié 11 nov" title="Avisos" />
      <ListaAvisos items={ITEMS} personas={PERSONAS} nombreUsuario="Micaela" hayNoLeidos hayOtrosAvisos={false} />
      <p className="px-2 text-center text-[11.5px] font-medium text-subtle">
        Vista previa: el aviso de arriba ahora abre <b>{aviso.url.replace(JESUS, "<id>")}</b>.{" "}
        <Link href="?pantalla=ficha" className="font-bold text-teal-deep">Ver a dónde lleva →</Link>
      </p>
    </div>
  );
}

function PantallaFicha() {
  return (
    <div className="flex flex-col gap-5 px-[18px] pb-10 pt-1.5">
      <TopBar volverA="/app/familia" eyebrow="Perfil a cargo" title="Jesús" />
      <div className="flex items-center gap-3.5 rounded-[22px] bg-card p-[18px] shadow-card">
        <AvatarPersona nombre="Jesús" color="violeta" size={60} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-heading text-[18px] font-extrabold tracking-[-0.02em]">Jesús</div>
          <div className="mt-0.5 truncate text-[12px] font-medium text-subtle">78 años · PAMI · 3 remedios</div>
        </div>
      </div>
      <AccionesMiembro elderId={JESUS} vinculoId="v1" nombre="Jesús" soloVerRutina />
      <HoyPendientes
        elderId={JESUS}
        nombre="Jesús"
        subtitulo="1 de 2 tomadas"
        pendientes={[{ id: "m1", nombre: "Amoxicilina", meta: "9:00 · hace 35 min" }]}
        conectado
        puedeRecordar
      />
      <section>
        <h2 className="eyebrow px-1 pb-2.5 text-subtle">Su celular</h2>
        <div className="flex items-center gap-3 rounded-[20px] bg-card px-4 py-[15px] shadow-card">
          <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-success ring-4 ring-success/15" />
          <div className="min-w-0 flex-1">
            <div className="font-heading text-[14.5px] font-extrabold tracking-[-0.02em]">Conectado · modo simple</div>
            <div className="mt-0.5 text-[11.5px] font-medium text-subtle">Si cambia de celular, mandale un código nuevo</div>
          </div>
          <span className="shrink-0 rounded-full bg-chip-teal-bg px-3.5 py-[9px] text-[12.5px] font-extrabold text-teal-deep">Código nuevo</span>
        </div>
        <div className="mt-2.5 flex items-center gap-3 rounded-[20px] bg-card px-4 py-[15px] shadow-card">
          <span className="flex size-[42px] shrink-0 items-center justify-center rounded-[14px] bg-persona-violeta-tint text-persona-violeta-deep">
            <VitaIcon name="smartphone" size={20} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-heading text-[14.5px] font-extrabold tracking-[-0.02em]">Su modo simple</span>
            <span className="mt-0.5 block text-[11.5px] font-medium text-subtle">Cómo lo ve Jesús en su celular</span>
          </span>
          <VitaIcon name="chevron-right" size={17} className="shrink-0 text-faint" />
        </div>
      </section>
    </div>
  );
}

export default async function Page({ searchParams }: { searchParams: Promise<{ pantalla?: string }> }) {
  const habilitado = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_ENABLE_TEST_LOGIN === "true";
  if (!habilitado) notFound();
  const { pantalla } = await searchParams;
  return (
    <div className="mx-auto min-h-dvh w-full max-w-md bg-background">
      {pantalla === "ficha" ? <PantallaFicha /> : <PantallaAvisos />}
    </div>
  );
}
