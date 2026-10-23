import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import * as familiaNucleo from "@/lib/familia/nucleo";
import { TopBar } from "../../../top-bar";
import { ConectarCelular } from "./conectar-celular";

// V7 "fam-code" (Conectar su celular): código de acceso para que la persona
// entre a vita desde su celular. Generar un código abre sesión COMO esa
// persona, así que exige permiso Admin (la RLS de codigos_acceso también).
export default async function ConectarCelularPage(props: PageProps<"/app/familia/[id]/conectar">) {
  await requireUser();
  const { id } = await props.params;
  const familia = await familiaNucleo.listarFamilia(await createClient());
  const persona = familia.find((m) => m.id === id);
  if (!persona) notFound();
  if (persona.rol !== "editar") redirect(`/app/familia/${id}`);
  const primerNombre = persona.nombre.split(" ")[0];

  return (
    <div className="flex flex-col gap-[18px] px-[18px] pb-10 pt-1.5">
      <TopBar volverA={`/app/familia/${id}`} eyebrow={`${primerNombre} · modo simple`} title="Conectar su celular" />
      <ConectarCelular personaId={persona.id} nombre={primerNombre} yaConectado={persona.conectado} />
    </div>
  );
}
