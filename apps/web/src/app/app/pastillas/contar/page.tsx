import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import * as inventarioNucleo from "@/lib/inventario/nucleo";
import { redirect } from "next/navigation";
import { TopBar } from "../../top-bar";
import { obtenerPerfilActivo } from "@/lib/familia/perfil-activo";
import { BannerPerfil } from "@/components/vita/banner-perfil";
import { destinoSeguro } from "@/lib/navegacion/destino-seguro";
import { FlujoContar, type OpcionMedicamento } from "./flujo-contar";

export default async function ContarPastillasPage(props: PageProps<"/app/pastillas/contar">) {
  await requireUser();
  const supabase = await createClient();
  const activo = await obtenerPerfilActivo();
  if (activo.rol !== "editar") redirect("/app/pastillas");

  const searchParams = await props.searchParams;
  const param = searchParams?.medicamento;
  const preseleccionado = Array.isArray(param) ? param[0] : param;

  const nombreParam = searchParams?.nombre;
  const nombreInicial = (Array.isArray(nombreParam) ? nombreParam[0] : nombreParam)?.trim().slice(0, 80) ?? "";
  const desdeParam = searchParams?.desde;
  const desde = Array.isArray(desdeParam) ? desdeParam[0] : desdeParam;
  // Solo vuelve a las pantallas de Medicamentos desde las que se abre; cualquier otro valor cae a "Mis pastillas".
  const volverA = destinoSeguro(
    desde === "medicamentos" ? "/app/medicamentos" : desde === "agregar" ? "/app/agregar-medicamento" : null,
    "/app/pastillas"
  );

  const grupos = await inventarioNucleo.listarGrupos(supabase, activo.id);

  const opciones: OpcionMedicamento[] = grupos.map((g) => ({
    id: g.representanteId,
    nombre: g.nombre,
    etiqueta: g.dosis ? `${g.nombre} · ${g.dosis}` : g.nombre,
    stockActual: g.inventario?.stock ?? null,
    pastillasPorToma: g.inventario?.pastillas_por_toma ?? 1,
    usaCantidadPorToma: g.usaCantidadPorToma ?? false,
  }));

  // `?medicamento=` puede ser el id de cualquier fila del medicamento (no
  // solo la representante del grupo) — se resuelve a la opción del grupo.
  const grupoPreseleccionado = grupos.find((g) => preseleccionado && g.medicamentoIds.includes(preseleccionado));

  return (
    <div className="flex flex-col gap-[18px] px-[18px] pt-1.5">
      <TopBar volverA={volverA} eyebrow="Medicamentos" title="Contar pastillas" />
      <BannerPerfil perfil={activo} accion="cargar" />
      <FlujoContar opciones={opciones} inicialId={grupoPreseleccionado?.representanteId ?? ""}
        nombreInicial={nombreInicial}
        volverA={volverA === "/app/agregar-medicamento" ? "/app/pastillas" : volverA}
      />
    </div>
  );
}
