import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import * as familiaNucleo from "@/lib/familia/nucleo";
import * as perfilNucleo from "@/lib/perfil/nucleo";
import * as medicamentosNucleo from "@/lib/medicamentos/nucleo";
import { colorPorDefecto } from "@/lib/familia/colores";
import { edadTexto } from "@/lib/perfil/formato";
import { cn } from "@/lib/utils";
import { AvatarPersona } from "@/components/vita/avatar-persona";
import { FilaCuidador } from "@/components/vita/fila-cuidador";
import { VitaIcon } from "@/lib/vita-icons";
import { TopBar } from "../../top-bar";
import { AccionesMiembro, EditarMiembro } from "./acciones";

// V7 "fam-perfil": una persona que cuido. Solo se llega con un vínculo
// aceptado (listar_familia); cualquier otro id es 404.
export default async function MiembroFamiliaPage(props: PageProps<"/app/familia/[id]">) {
  const usuario = await requireUser();
  const { id } = await props.params;
  const supabase = await createClient();
  const familia = await familiaNucleo.listarFamilia(supabase);
  const indice = familia.findIndex((m) => m.id === id);
  if (indice < 0) notFound();
  const miembro = familia[indice];
  const color = miembro.color ?? colorPorDefecto(indice);
  const puedeEditar = miembro.rol === "editar";
  const primerNombre = miembro.nombre.split(" ")[0];

  const [perfil, nRemedios, miNombre] = await Promise.all([
    perfilNucleo.obtenerPerfil(supabase, id).catch(() => null),
    medicamentosNucleo.contarRemediosDistintos(supabase, id).catch(() => 0),
    perfilNucleo.obtenerNombre(supabase, usuario.id),
  ]);
  const meta = [
    perfil ? edadTexto(perfil) : null,
    perfil?.obra_social?.trim() || null,
    `${nRemedios} ${nRemedios === 1 ? "remedio" : "remedios"}`,
  ]
    .filter(Boolean)
    .join(" · ");

  const { lista: cuidadores } = await familiaNucleo.cuidadoresDePersona(supabase, {
    personaId: id,
    usuarioId: usuario.id,
    miNombre,
    miRol: miembro.rol,
    esPropio: false,
  });
  const otrosAceptados = cuidadores.filter((c) => c.estado === "aceptado" && !c.esYo).length;

  return (
    <div className="flex flex-col gap-5 px-[18px] pb-10 pt-1.5">
      <TopBar eyebrow="Perfil a cargo" title={primerNombre} />

      <div className="flex items-center gap-3.5 rounded-[22px] bg-card p-[18px] shadow-card">
        <AvatarPersona nombre={miembro.nombre} color={color} size={60} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-heading text-[18px] font-extrabold tracking-[-0.02em]">{miembro.nombre}</div>
          <div className="mt-0.5 truncate text-[12px] font-medium text-subtle">{meta}</div>
        </div>
      </div>

      {/* Propio de la app (no está en el diseño): cambia el perfil activo. */}
      <AccionesMiembro elderId={miembro.id} vinculoId={miembro.vinculoId} nombre={primerNombre} soloVerRutina />

      <section>
        <h2 className="eyebrow px-1 pb-2.5 text-subtle">Su celular</h2>
        <div className="flex items-center gap-3 rounded-[20px] bg-card px-4 py-[15px] shadow-card">
          <span
            aria-hidden
            className={cn(
              "size-2.5 shrink-0 rounded-full ring-4",
              miembro.conectado ? "bg-success ring-success/15" : "bg-faint ring-faint/20"
            )}
          />
          <div className="min-w-0 flex-1">
            <div className="font-heading text-[14.5px] font-extrabold tracking-[-0.02em]">
              {miembro.conectado ? "Conectado · modo simple" : "Todavía no usa vita"}
            </div>
            <div className="mt-0.5 text-pretty text-[11.5px] font-medium text-subtle">
              {miembro.conectado
                ? "Si cambia de celular, mandale un código nuevo"
                : "Conectá su celular y le llegan los avisos de sus remedios"}
            </div>
          </div>
          {puedeEditar && (
            <Link
              href={`/app/familia/${id}/conectar`}
              className={cn(
                "shrink-0 rounded-full px-3.5 py-[9px] text-[12.5px] font-extrabold",
                miembro.conectado ? "bg-chip-teal-bg text-teal-deep" : "bg-primary text-primary-foreground"
              )}
            >
              {miembro.conectado ? "Código nuevo" : "Conectar"}
            </Link>
          )}
        </div>

        <Link
          href={`/app/familia/${id}/modo-simple`}
          className="mt-2.5 flex items-center gap-3 rounded-[20px] bg-card px-4 py-[15px] shadow-card transition-transform active:scale-[0.99]"
        >
          <span className="flex size-[42px] shrink-0 items-center justify-center rounded-[14px] bg-persona-violeta-tint text-persona-violeta-deep">
            <VitaIcon name="smartphone" size={20} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-heading text-[14.5px] font-extrabold tracking-[-0.02em]">Su modo simple</span>
            <span className="mt-0.5 block text-[11.5px] font-medium text-subtle">Cómo lo ve {primerNombre} en su celular</span>
          </span>
          <VitaIcon name="chevron-right" size={17} className="shrink-0 text-faint" />
        </Link>
      </section>

      <section>
        <h2 className="eyebrow px-1 pb-2.5 text-subtle">Quién la cuida</h2>
        <ul className="overflow-hidden rounded-[20px] bg-card shadow-card">
          {cuidadores.map((c, i) => (
            <li key={c.vinculoId || c.cuidadorId}>
              <FilaCuidador
                cuidador={c}
                indice={i + 1}
                primera={i === 0}
                personaNombre={primerNombre}
                href={c.esYo || !c.vinculoId ? undefined : `/app/familia/${id}/cuidadores/${c.vinculoId}`}
              />
            </li>
          ))}
        </ul>
      </section>

      {/* Propio de la app (no está en el diseño): nombre y color del perfil. */}
      {puedeEditar ? (
        <EditarMiembro elderId={miembro.id} nombreInicial={miembro.nombre} colorInicial={color} />
      ) : (
        <div className="rounded-[20px] bg-card p-[18px] text-[13px] font-medium leading-[1.45] text-subtle shadow-card">
          Tenés permiso de <b className="text-foreground">Lector</b>: ves sus remedios, turnos y salud, pero no podés
          cambiar nada. El permiso lo decide {primerNombre} desde su cuenta.
        </div>
      )}

      <AccionesMiembro
        elderId={miembro.id}
        vinculoId={miembro.vinculoId}
        nombre={primerNombre}
        soloQuitar
        ultimoCuidador={otrosAceptados === 0 && !miembro.conectado}
      />
    </div>
  );
}
