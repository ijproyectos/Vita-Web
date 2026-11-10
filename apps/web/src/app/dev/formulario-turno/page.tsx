import { notFound } from "next/navigation";
import { VistaFormularioTurno } from "./vista";

// Vista previa del formulario de turno (alta y edición son el mismo) SIN
// login. Solo dev/test: 404 en producción salvo NEXT_PUBLIC_ENABLE_TEST_LOGIN
// === "true" (mismo criterio que /dev/invitar-cuidador). `?modo=editar`.
export default async function Page(props: PageProps<"/dev/formulario-turno">) {
  const habilitado = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_ENABLE_TEST_LOGIN === "true";
  if (!habilitado) notFound();
  const modo = (await props.searchParams)?.modo === "editar" ? "editar" : "alta";
  return <VistaFormularioTurno key={modo} modo={modo} />;
}
