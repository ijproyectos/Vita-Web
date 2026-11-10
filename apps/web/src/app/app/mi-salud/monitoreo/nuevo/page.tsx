import { redirect } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { obtenerPerfilActivo } from "@/lib/familia/perfil-activo";
import { BannerPerfil } from "@/components/vita/banner-perfil";
import * as planesNucleo from "@/lib/mediciones/planes-nucleo";
import Link from "next/link";
import { VitaIcon } from "@/lib/vita-icons";
import { META_MEDICION, TIPOS_PLAN, claveNombreOtra, esTipoMedicion, hrefNuevoMonitoreo, volverSeguro, type TipoMedicion } from "@/lib/mediciones/tipos";
import { TopBar } from "../../../top-bar";
import { FormularioMonitoreo } from "./formulario";

const primero = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function NuevoMonitoreoPage(props: PageProps<"/app/mi-salud/monitoreo/nuevo">) {
  await requireUser();
  const activo = await obtenerPerfilActivo();
  if (activo.rol !== "editar") redirect("/app/mi-salud/monitoreo");

  const params = await props.searchParams;
  const volver = volverSeguro(primero(params?.volver));
  const pedido = primero(params?.tipo);
  const tipoPedido = esTipoMedicion(pedido) && TIPOS_PLAN.includes(pedido) ? pedido : null;

  const supabase = await createClient();
  const planes = await planesNucleo.listarSeguro(supabase, activo.id);
  const conPlan = (t: TipoMedicion) => planes.some((p) => p.tipo === t && claveNombreOtra(p.nombre_otra) === "");
  // "Cambiar monitoreo" solo si se entró desde una métrica que ya tiene plan (su detalle).
  // Sin métrica elegida (el +, Rutina, el estado vacío) siempre es uno nuevo, con las que faltan.
  const existente = tipoPedido ? (planes.find((p) => p.tipo === tipoPedido && claveNombreOtra(p.nombre_otra) === "") ?? null) : null;
  const libres = TIPOS_PLAN.filter((t) => !conPlan(t));
  const tipo = existente ? existente.tipo : tipoPedido && !conPlan(tipoPedido) ? tipoPedido : libres[0];

  return (
    <div className="flex flex-col gap-[22px] px-[18px] pt-1.5">
      <TopBar eyebrow="Monitoreo" title={existente ? "Cambiar monitoreo" : "Nuevo monitoreo"} volverA={volver} />
      <BannerPerfil perfil={activo} accion="cargar" />
      {existente || tipo ? (
        <FormularioMonitoreo
          tipoInicial={existente ? existente.tipo : tipo}
          nombreInicial=""
          existente={existente}
          tipos={existente ? TIPOS_PLAN.filter((t) => t === existente.tipo) : libres}
          volver={volver}
          paraNombre={activo.esPropio ? undefined : activo.nombre.split(" ")[0]}
        />
      ) : (
        <TodasConMonitoreo volver={volver} />
      )}
    </div>
  );
}

/** Ya hay monitoreo de todas las métricas que se ofrecen: se cambia desde cada una. */
function TodasConMonitoreo({ volver }: { volver: string }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="px-0.5 text-[13.5px] font-medium leading-normal text-slate-brand">
        Ya tenés un monitoreo para cada medición. Tocá una para cambiar sus horarios.
      </p>
      <div className="flex flex-col gap-[9px]">
        {TIPOS_PLAN.map((t) => (
          <Link
            key={t}
            href={hrefNuevoMonitoreo({ tipo: t, volver })}
            className="flex items-center gap-3 rounded-[var(--radius-item)] bg-card px-[18px] py-[15px] text-[14px] font-bold shadow-item transition-colors active:bg-secondary"
          >
            <VitaIcon name={META_MEDICION[t].icono} size={17} className="text-primary" />
            <span className="flex-1">{META_MEDICION[t].nombre}</span>
            <VitaIcon name="chevron-right" size={16} className="text-subtle" />
          </Link>
        ))}
      </div>
    </div>
  );
}
