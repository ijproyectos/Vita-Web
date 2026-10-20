import { notFound } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import * as familiaNucleo from "@/lib/familia/nucleo";
import { colorPorDefecto } from "@/lib/familia/colores";
import { ETIQUETA_ROL } from "@/lib/familia/tipos";
import { AvatarPersona } from "@/components/vita/avatar-persona";
import { VitaIcon } from "@/lib/vita-icons";
import { CodigoAcceso } from "@/app/cuidar/[elderId]/codigo-acceso";
import { TopBar } from "../../top-bar";
import { AccionesMiembro, EditarMiembro } from "./acciones";

// V7 "fam-perfil": una persona que cuido. Solo se llega con un vínculo
// aceptado (listar_familia); cualquier otro id es 404.
export default async function MiembroFamiliaPage(props: PageProps<"/app/familia/[id]">) {
  await requireUser();
  const { id } = await props.params;
  const supabase = await createClient();
  const familia = await familiaNucleo.listarFamilia(supabase);
  const indice = familia.findIndex((m) => m.id === id);
  if (indice < 0) notFound();
  const miembro = familia[indice];
  const color = miembro.color ?? colorPorDefecto(indice);
  const puedeEditar = miembro.rol === "editar";
  const primerNombre = miembro.nombre.split(" ")[0];

  return (
    <div className="flex flex-col gap-[18px] px-[18px] pb-10 pt-1.5">
      <TopBar eyebrow="Perfil a cargo" title={miembro.nombre} />

      <div className="flex items-center gap-3.5 rounded-[20px] bg-card p-[18px] shadow-card">
        <AvatarPersona nombre={miembro.nombre} color={color} size={60} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-heading text-[18px] font-extrabold tracking-[-0.02em]">{miembro.nombre}</div>
          <div className="mt-0.5 text-[11.5px] font-medium text-subtle">
            {[miembro.relacion, `Tu permiso: ${ETIQUETA_ROL[miembro.rol].titulo}`].filter(Boolean).join(" · ")}
          </div>
        </div>
      </div>

      <AccionesMiembro elderId={miembro.id} vinculoId={miembro.vinculoId} nombre={primerNombre} soloVerRutina />

      {puedeEditar ? (
        <EditarMiembro elderId={miembro.id} nombreInicial={miembro.nombre} colorInicial={color} />
      ) : (
        <div className="rounded-[20px] bg-card p-[18px] text-[13px] font-medium leading-[1.45] text-subtle shadow-card">
          Tenés permiso de <b className="text-foreground">Lector</b>: ves sus remedios, turnos y salud, pero no podés
          cambiar nada. El permiso lo decide {primerNombre} desde su cuenta.
        </div>
      )}

      <section>
        <h2 className="px-0.5 pb-[9px] font-heading text-[17px] font-extrabold tracking-[-0.03em]">Su celular</h2>
        <div className="mb-2.5 flex items-center gap-3 rounded-[20px] bg-card p-[15px] shadow-card">
          <span
            className={
              "flex size-10 shrink-0 items-center justify-center rounded-full " +
              (miembro.conectado ? "bg-chip-teal-bg text-chip-teal-ink" : "bg-secondary text-subtle")
            }
          >
            <VitaIcon name="smartphone" size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-heading text-[14.5px] font-extrabold tracking-[-0.02em]">
              {miembro.conectado ? "Ya entró a vita" : "Todavía no usa vita"}
            </div>
            <div className="mt-0.5 text-[11.5px] font-medium text-subtle">
              {miembro.conectado
                ? "Si cambia de celular, generale un código nuevo."
                : "Con un código entra desde su celular y le llegan los avisos de sus remedios."}
            </div>
          </div>
        </div>
        {puedeEditar && (
          <CodigoAcceso
            elderId={miembro.id}
            titulo="Que use su celular"
            descripcion={`Generá un código y pasáselo a ${primerNombre}. Lo ingresa en vita con "Me invitó un familiar, tengo un código".`}
          />
        )}
      </section>

      <section className="rounded-[20px] bg-card p-[18px] shadow-card">
        <div className="font-heading text-[15px] font-extrabold tracking-[-0.02em]">Su modo simple</div>
        <p className="mt-1 text-[12.5px] font-medium leading-[1.45] text-subtle">
          Cuando {primerNombre} entra con el código, vita le muestra el modo simple: una dosis a la vez, con letra grande,
          voz y un botón para confirmar que la tomó. Vos ves en tu app si la confirmó.
        </p>
      </section>

      <AccionesMiembro elderId={miembro.id} vinculoId={miembro.vinculoId} nombre={primerNombre} soloQuitar />
    </div>
  );
}
