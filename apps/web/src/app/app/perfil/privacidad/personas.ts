import "server-only";
import { requireUser } from "@/lib/dal";
import { obtenerOpcionesPerfil, rolSobre } from "@/lib/familia/perfil-activo";

export type PersonaDatos = { id: string; etiqueta: string; nombre: string; esPropio: boolean };

// "De quién": uno mismo y las personas que cuidás con permiso Admin (un
// Lector no descarga lo de otro, igual que en el diseño).
export async function personasConDatos(): Promise<PersonaDatos[]> {
  const usuario = await requireUser();
  const opciones = await obtenerOpcionesPerfil();
  const personas: PersonaDatos[] = [];
  for (const o of opciones) {
    if (o.esPropio) personas.push({ id: o.id, etiqueta: "Mis datos", nombre: o.nombre, esPropio: true });
    else if ((await rolSobre(o.id)) === "editar") personas.push({ id: o.id, etiqueta: o.nombre, nombre: o.nombre, esPropio: false });
  }
  if (!personas.some((p) => p.esPropio)) personas.unshift({ id: usuario.id, etiqueta: "Mis datos", nombre: "vos", esPropio: true });
  return personas;
}
