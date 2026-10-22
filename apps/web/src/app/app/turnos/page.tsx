import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import * as turnosNucleo from "@/lib/turnos/nucleo";
import { VitaIcon } from "@/lib/vita-icons";
import { TopBar } from "../top-bar";
import { obtenerPerfilActivo } from "@/lib/familia/perfil-activo";
import { BannerPerfil } from "@/components/vita/banner-perfil";
import { ListaTurnos } from "./lista";

// Mis turnos (Home → "Ver todos"): próximos turnos agrupados por día.
// Lápiz y papelera por fila; `?editar=<id>` abre ese turno ya en edición.
export default async function TurnosPage(props: PageProps<"/app/turnos">) {
  await requireUser();
  const supabase = await createClient();
  const activo = await obtenerPerfilActivo();
  const turnos = await turnosNucleo.listarProximos(supabase, activo.id, 50);

  const pedido = (await props.searchParams)?.editar;
  const editarPedido = Array.isArray(pedido) ? pedido[0] : pedido;
  const editarId = turnos.find((t) => t.id === editarPedido)?.id;

  return (
    <div className="flex flex-col gap-5 px-[18px] pb-10 pt-1.5">
      <TopBar eyebrow="Agenda" title={activo.esPropio ? "Mis turnos" : `Turnos de ${activo.nombre.split(" ")[0]}`} />
      <BannerPerfil perfil={activo} />

      {turnos.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-[20px] bg-card px-5 pb-[22px] pt-[26px] text-center shadow-card">
          <div className="flex size-12 items-center justify-center rounded-full bg-persona-1-tint text-persona-1">
            <VitaIcon name="stethoscope" size={22} />
          </div>
          <div className="mt-0.5 font-heading text-[15px] font-extrabold tracking-[-0.02em]">Todavía no hay turnos</div>
          <div className="max-w-[280px] text-[12.5px] font-medium leading-[1.45] text-subtle text-balance">
            Cargá el próximo turno y te aviso el día antes, con lo que hay que llevar.
          </div>
        </div>
      )}

      <ListaTurnos
        turnos={turnos}
        editarInicial={activo.rol === "editar" ? editarId : undefined}
        puedeEditar={activo.rol === "editar"}
        perfil={activo}
      />

      {activo.rol === "editar" && (
      <Link
        href="/app/agregar-turno"
        className="flex items-center justify-center gap-2 rounded-full bg-primary py-[15px] font-heading text-sm font-extrabold text-primary-foreground shadow-cta"
      >
        <VitaIcon name="plus" size={16} strokeWidth={2.6} />
        Agregar turno
      </Link>
      )}
    </div>
  );
}
