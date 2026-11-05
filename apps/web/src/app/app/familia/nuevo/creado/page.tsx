import { redirect } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import * as familiaNucleo from "@/lib/familia/nucleo";
import { colorPorDefecto } from "@/lib/familia/colores";
import { nombreConMayuscula } from "@/lib/perfil/formato";
import { PerfilCreado } from "./perfil-creado";

// El id viene de la URL: solo se muestra si esa persona está a cargo del usuario
// con permiso de Admin. Cualquier otro caso vuelve a Familia.
export default async function PerfilCreadoPage(props: PageProps<"/app/familia/nuevo/creado">) {
  await requireUser();
  const { persona } = await props.searchParams;
  const familia = await familiaNucleo.listarFamilia(await createClient());
  const indice = familia.findIndex((m) => m.id === persona && m.rol === "editar");
  if (indice < 0) redirect("/app/familia");

  const miembro = familia[indice];
  return (
    <PerfilCreado
      id={miembro.id}
      nombre={nombreConMayuscula(miembro.nombre)}
      color={miembro.color ?? colorPorDefecto(indice)}
    />
  );
}
