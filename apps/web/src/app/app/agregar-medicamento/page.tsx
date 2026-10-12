import { requireUser } from "@/lib/dal";
import { TopBar } from "../top-bar";
import { VitaShortcutButton } from "../vita-shortcut-button";
import { FormularioAgregarMedicamento } from "./formulario";

function primero(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

export default async function AgregarMedicamentoPage(props: PageProps<"/app/agregar-medicamento">) {
  await requireUser();

  // Prellenado desde "Mis pastillas" (blister de un medicamento nuevo). Todo
  // es texto de la URL: se acota acá y el form/acción vuelven a validar.
  const sp = (await props.searchParams) ?? {};
  const nombre = primero(sp.nombre).trim().slice(0, 80);
  const dosis = primero(sp.dosis).trim().slice(0, 40);
  const unidad = primero(sp.unidad).trim().slice(0, 10);
  const stock = /^\d{1,4}$/.test(primero(sp.stock)) ? primero(sp.stock) : "";
  const porToma = /^\d{1,2}$/.test(primero(sp.porToma)) ? primero(sp.porToma) : "1";

  return (
    <div className="flex flex-col gap-4.5 px-4 pt-2">
      <TopBar eyebrow="Rutina" title="Agregar medicamento" accionDerecha={<VitaShortcutButton />} />
      <VitaShortcutButton size="banner" />
      <FormularioAgregarMedicamento
        inicial={{ nombre, dosis, unidad, stockInicial: stock, pastillasPorToma: porToma }}
      />
    </div>
  );
}
