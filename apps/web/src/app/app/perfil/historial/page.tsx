import { redirect } from "next/navigation";

// El historial imprimible completo ya no existe: el PDF para el médico es el
// resumen de "Para tu médico" y el archivo completo se baja desde Privacidad
// (`/app/perfil/historial/datos`). Queda la ruta para links viejos.
export default async function HistorialPage({ searchParams }: PageProps<"/app/perfil/historial">) {
  const { de } = await searchParams;
  const id = Array.isArray(de) ? de[0] : de;
  redirect(id ? `/app/perfil/compartir/pdf?de=${encodeURIComponent(id)}` : "/app/perfil/compartir/pdf");
}
