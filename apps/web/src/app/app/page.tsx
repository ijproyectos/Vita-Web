import { redirect } from "next/navigation";

// Único módulo real hoy es Medicamentos — cuando exista un dashboard de
// verdad (turnos, métricas), esta página pasa a ser esa bandeja de hoy.
export default function AppHomePage() {
  redirect("/app/medicamentos");
}
