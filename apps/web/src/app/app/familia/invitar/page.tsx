import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import * as familiaNucleo from "@/lib/familia/nucleo";
import { obtenerPerfilActivo } from "@/lib/familia/perfil-activo";
import { colorPorDefecto } from "@/lib/familia/colores";
import { TopBar } from "../../top-bar";
import { FormularioInvitar, type PersonaInvitable } from "./formulario";

// V7 "fam-invite": nombre, relación, a quién va a cuidar y permiso. Solo se
// ofrecen las personas sobre las que el usuario puede invitar: él mismo y los
// perfiles a su cargo con permiso Admin que además gestiona (RPC de 027).
export default async function InvitarCuidadorPage(props: PageProps<"/app/familia/invitar">) {
  const usuario = await requireUser();
  const { persona } = await props.searchParams;
  const supabase = await createClient();
  const [activo, familia] = await Promise.all([obtenerPerfilActivo(), familiaNucleo.listarFamilia(supabase)]);

  const candidatas = familia.filter((m) => m.rol === "editar");
  const gestionables = await Promise.all(
    candidatas.map(async (m) => {
      const lista = await familiaNucleo.listarCuidadoresDe(supabase, m.id);
      return lista?.some((c) => c.puedeGestionar) ? m : null;
    })
  );

  const opciones: PersonaInvitable[] = [
    { id: usuario.id, nombre: "Vos", sub: "Tu perfil", color: "teal", propia: true },
    ...gestionables
      .map((m, i) =>
        m ? { id: m.id, nombre: m.nombre, sub: m.relacion ?? "A tu cargo", color: m.color ?? colorPorDefecto(i), propia: false } : null
      )
      .filter((o): o is PersonaInvitable => o !== null),
  ];

  const pedida = typeof persona === "string" ? persona : activo.id;
  const inicial = opciones.find((o) => o.id === pedida)?.id ?? opciones[0].id;

  return (
    <div className="flex flex-col gap-[22px] px-[18px] pb-10 pt-1.5">
      <TopBar eyebrow="Familia" title="Invitar a un cuidador" />
      <FormularioInvitar personas={opciones} personaInicial={inicial} />
    </div>
  );
}
