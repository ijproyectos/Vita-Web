import { notFound } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import * as familiaNucleo from "@/lib/familia/nucleo";
import { colorPorDefecto } from "@/lib/familia/colores";
import { AvatarPersona } from "@/components/vita/avatar-persona";
import { TopBar } from "../../../../top-bar";
import { AccionesCuidador } from "./acciones";

// V7 "fam-member": un cuidador de una persona — permiso Admin/Lector y
// "Quitar a X". Quién puede cambiarlo lo decide la RPC (la propia persona, o un
// Admin de un perfil gestionado); sin permiso se ve en modo lectura.
export default async function CuidadorPage(props: PageProps<"/app/familia/[id]/cuidadores/[vinculoId]">) {
  const usuario = await requireUser();
  const { id, vinculoId } = await props.params;
  const supabase = await createClient();
  const familia = await familiaNucleo.listarFamilia(supabase);
  const persona = familia.find((m) => m.id === id);
  if (id !== usuario.id && !persona) notFound();

  const lista = await familiaNucleo.listarCuidadoresDe(supabase, id);
  const indice = lista?.findIndex((c) => c.vinculoId === vinculoId) ?? -1;
  if (!lista || indice < 0) notFound();
  const c = lista[indice];

  const personaNombre = id === usuario.id ? "vos" : (persona?.nombre ?? "esta persona");
  const personaPrimer = personaNombre.split(" ")[0];
  const pendiente = c.estado === "pendiente";
  // Quien cuida a un perfil gestionado como Admin puede además invitar/quitar.
  const administraCuidadores = id !== usuario.id;
  const meta = [c.relacion, c.email, `cuida a ${personaPrimer}`].filter(Boolean).join(" · ");

  return (
    <div className="flex flex-col gap-5 px-[18px] pb-10 pt-1.5">
      <TopBar eyebrow="Cuidador" title={c.nombre} />

      <div className="flex items-center gap-3.5 rounded-[22px] bg-card p-[18px] shadow-card">
        <AvatarPersona nombre={c.nombre} color={colorPorDefecto(indice + 1)} size={60} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-heading text-[18px] font-extrabold tracking-[-0.02em]">{c.nombre}</div>
          <div className="mt-0.5 break-words text-[12px] font-medium leading-[1.4] text-subtle">{meta}</div>
        </div>
      </div>

      <AccionesCuidador
        personaId={id}
        personaNombre={personaPrimer}
        vinculoId={c.vinculoId}
        nombre={c.nombre.split(" ")[0]}
        rolInicial={c.rol}
        pendiente={pendiente}
        puedeGestionar={c.puedeGestionar}
        administraCuidadores={administraCuidadores}
        venceEl={pendiente && c.expiraAt ? c.expiraAt : null}
        tieneLink={pendiente && Boolean(c.token)}
      />
    </div>
  );
}
