import { requireUser } from "@/lib/dal";
import { Seguimiento } from "./seguimiento";

// Destino de back_url de Mercado Pago. El pago real lo confirma el webhook: esta página solo consulta el estado.
export default async function GraciasVitaPlusPage() {
  await requireUser();
  return <Seguimiento />;
}
