import { requireUser } from "@/lib/dal";
import { redirect } from "next/navigation";
import { obtenerPerfilActivo } from "@/lib/familia/perfil-activo";
import { BannerPerfil } from "@/components/vita/banner-perfil";
import { TopBar } from "../top-bar";
import { VitaShortcutButton } from "../vita-shortcut-button";
import { FormularioAgregarMedicamento } from "./formulario";

function primero(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

export default async function AgregarMedicamentoPage(props: PageProps<"/app/agregar-medicamento">) {
  await requireUser();
  // Familia: se carga para el perfil activo; con permiso "ver" no hay alta.
  const activo = await obtenerPerfilActivo();
  if (activo.rol !== "editar") redirect("/app");

  // Prellenado desde "Mis pastillas" (blister de un medicamento nuevo). Todo
  // es texto de la URL: se acota acá y el form/acción vuelven a validar.
  const sp = (await props.searchParams) ?? {};
  const nombre = primero(sp.nombre).trim().slice(0, 80);
  const dosis = primero(sp.dosis).trim().slice(0, 40);
  const unidad = primero(sp.unidad).trim().slice(0, 10);
  const stock = /^\d{1,4}$/.test(primero(sp.stock)) ? primero(sp.stock) : "";
  const porToma = /^\d{1,2}$/.test(primero(sp.porToma)) ? primero(sp.porToma) : "1";

  return (
    <div className="flex flex-col gap-[22px] px-[18px] pt-1.5">
      <TopBar eyebrow="Rutina" title="Agregar medicamento" accionDerecha={activo.esPropio ? <VitaShortcutButton /> : undefined} />
      {/* El chat con vita actúa sobre la cuenta logueada: para otra persona no se ofrece. */}
      {activo.esPropio ? <VitaShortcutButton size="banner" /> : <BannerPerfil perfil={activo} accion="cargar" />}
      <FormularioAgregarMedicamento
        inicial={{ nombre, dosis, unidad, stockInicial: stock, pastillasPorToma: porToma }}
      />
    </div>
  );
}
