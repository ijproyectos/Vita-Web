import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import * as medicamentos from "@/lib/medicamentos/nucleo";
import { agruparMedicamentos } from "@/lib/medicamentos/tipos";
import { obtenerPerfilActivo } from "@/lib/familia/perfil-activo";
import { BannerPerfil } from "@/components/vita/banner-perfil";
import { VitaIcon } from "@/lib/vita-icons";
import { TopBar } from "../top-bar";
import { cargarDatosDetalleMedicamento } from "@/lib/rutina/detalle-datos";
import * as inventario from "@/lib/inventario/nucleo";
import { ListaMedicamentos, type StockPorFila } from "./lista";

// Mis medicamentos (V7): un renglón por medicamento con sus horarios, lápiz
// para editarlo en la propia fila y papelera. `?editar=<id>` abre esa fila ya
// en edición (la hoja de detalle de la Rutina enlaza acá).
export default async function MedicamentosPage(props: PageProps<"/app/medicamentos">) {
  await requireUser();
  const supabase = await createClient();
  const activo = await obtenerPerfilActivo();
  const todos = await medicamentos.listarTodos(supabase, activo.id);
  const grupos = agruparMedicamentos(todos);
  const detalle = await cargarDatosDetalleMedicamento(supabase, activo.id, todos);
  const stocks: StockPorFila = {};
  for (const g of await inventario.listarGruposSeguro(supabase, activo.id)) {
    if (!g.inventario) continue;
    for (const id of g.medicamentoIds) stocks[id] = { stock: g.inventario.stock, porToma: g.inventario.pastillas_por_toma };
  }

  const pedido = (await props.searchParams)?.editar;
  const editarId = Array.isArray(pedido) ? pedido[0] : pedido;
  const grupoAEditar = editarId ? grupos.find((g) => g.filas.some((f) => f.id === editarId))?.id : undefined;
  const puedeEditar = activo.rol === "editar";

  return (
    <div className="flex flex-col gap-5 px-[18px] pb-10 pt-1.5">
      <TopBar volverA="/app/mi-salud"
        eyebrow="Mi salud"
        title={activo.esPropio ? "Mis medicamentos" : `Medicamentos de ${activo.nombre.split(" ")[0]}`}
      />
      <BannerPerfil perfil={activo} />

      <ListaMedicamentos
        grupos={grupos.map((g) => ({ id: g.id, filas: g.filas }))}
        editarInicial={puedeEditar ? grupoAEditar : undefined}
        puedeEditar={puedeEditar}
        perfil={activo}
        detalle={detalle}
        stocks={stocks}
      />

      <Link
        href="/app/pastillas"
        className="flex items-center gap-3 rounded-[20px] bg-card p-[15px] shadow-card transition-transform active:scale-[0.99] motion-reduce:transition-none"
      >
        <div className="flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-tile)] bg-chip-teal-bg text-chip-teal-ink">
          <VitaIcon name="camera" size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-heading text-[15px] font-extrabold tracking-[-0.02em]">
            {activo.esPropio ? "Mis pastillas" : "Sus pastillas"}
          </div>
          <div className="mt-0.5 text-[11.5px] font-medium text-subtle">Cuántas quedan de cada medicamento</div>
        </div>
        <VitaIcon name="chevron-right" size={18} className="shrink-0 text-faint" />
      </Link>

      {puedeEditar && (
        <Link
          href="/app/agregar-medicamento"
          className="flex items-center justify-center gap-2 rounded-full bg-primary py-[15px] font-heading text-sm font-extrabold text-primary-foreground shadow-cta"
        >
          <VitaIcon name="plus" size={16} strokeWidth={2.6} />
          Agregar medicamento
        </Link>
      )}
    </div>
  );
}
