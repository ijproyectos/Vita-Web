import { redirect } from "next/navigation";

// "Mis cuidadores" se unificó con Familia y permisos (V7): invitar, permisos y
// quitar cuidadores viven en /app/familia. Esta ruta queda por los links viejos.
export default function CuidadoresPage() {
  redirect("/app/familia");
}
