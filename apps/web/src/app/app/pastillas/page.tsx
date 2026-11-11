import { redirect } from "next/navigation";

// "Mis pastillas" ya no existe (no está en el diseño): el stock se ve y se
// cuenta desde Mis medicamentos. Queda la ruta para los avisos ya enviados.
export default function PastillasPage() {
  redirect("/app/medicamentos");
}
