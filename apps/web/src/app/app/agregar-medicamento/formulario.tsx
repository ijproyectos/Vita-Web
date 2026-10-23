"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FormularioMedicamento, type InicialMedicamento } from "@/components/vita/formulario-medicamento";
import { crearMedicamentoAction } from "../rutina/actions";

export type { InicialMedicamento };

// Alta de medicamento para el perfil activo (propio o de la familia). El form
// es el compartido de components/vita; acá solo se cablea la Server Action.
export function FormularioAgregarMedicamento({
  inicial,
  paraNombre,
}: {
  inicial?: InicialMedicamento;
  /** Primer nombre de la persona cuando el perfil activo no es el propio. */
  paraNombre?: string;
}) {
  const router = useRouter();
  return (
    <FormularioMedicamento
      accion={crearMedicamentoAction}
      inicial={inicial}
      etiquetaGuardar={paraNombre ? `+ Agregar medicamento a ${paraNombre}` : "✓ Guardar medicamento"}
      onExito={() => {
        toast.success("Medicamento agregado");
        router.replace("/app/rutina");
      }}
    />
  );
}
