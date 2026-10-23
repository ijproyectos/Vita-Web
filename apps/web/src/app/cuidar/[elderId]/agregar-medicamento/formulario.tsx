import { FormularioMedicamento } from "@/components/vita/formulario-medicamento";
import { crearMedicamentoParaElderAction } from "../actions";

// Misma UI que el alta propia (components/vita/formulario-medicamento); la
// action crea el medicamento para `elderId`. En el camino feliz la action
// redirige del lado del servidor, así que no hay toast ni router.push acá.
export function FormularioAgregarMedicamentoElder({ elderId, nombre }: { elderId: string; nombre: string }) {
  return (
    <FormularioMedicamento
      accion={crearMedicamentoParaElderAction.bind(null, elderId)}
      volverA={`/cuidar/${elderId}`}
      etiquetaGuardar={`+ Agregar medicamento a ${nombre.split(" ")[0]}`}
    />
  );
}
