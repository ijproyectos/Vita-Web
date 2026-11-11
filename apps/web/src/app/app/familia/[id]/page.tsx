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
import { obtenerPrefs } from "@/lib/modo-simple/nucleo";
import { resumenPrefsModoSimple } from "@/lib/modo-simple/resumen-prefs";
import { HoyPendientes } from "./hoy-pendientes";
import { resumenHoy } from "@/lib/familia/pendientes-hoy";

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

  const [perfil, nRemedios, miNombre, dosisHoy, prefsSimple] = await Promise.all([
    perfilNucleo.obtenerPerfil(supabase, id).catch(() => null),
    medicamentosNucleo.contarRemediosDistintos(supabase, id).catch(() => 0),
    perfilNucleo.obtenerNombre(supabase, usuario.id),
    medicamentosNucleo.listarHoy(supabase, id).catch(() => []),
    obtenerPrefs(supabase, id),
  ]);
  // "No la tomé" del modo simple (057): sin la migración el set viene vacío.
  const omitidas = await medicamentosNucleo.idsOmitidas(supabase, dosisHoy.map((m) => m.id), medicamentosNucleo.fechaEnAR());
  const hoy = resumenHoy(dosisHoy, medicamentosNucleo.horaEnAR(), omitidas);
  const emergencia = perfil?.contacto_emergencia_nombre?.trim();
  const emergenciaSub = [perfil?.contacto_emergencia_relacion?.trim(), perfil?.contacto_emergencia_telefono?.trim()].filter(Boolean).join(" · ");
  const meta = [
    perfil ? edadTexto(perfil) : null,
    perfil?.obra_social?.trim() || null,
    `${nRemedios} ${nRemedios === 1 ? "remedio" : "remedios"}`,
  ]
    .filter(Boolean)
    .join(" · ");

  const { lista: cuidadores, completa } = await familiaNucleo.cuidadoresDePersona(supabase, {
    personaId: id,
    usuarioId: usuario.id,
    miNombre,
    miRol: miembro.rol,
    esPropio: false,
  });
  const otrosAceptados = cuidadores.filter((c) => c.estado === "aceptado" && !c.esYo).length;
  const puedeInvitar = puedeEditar && completa && cuidadores.some((c) => c.puedeGestionar);

  return (
    <div className="flex flex-col gap-5 px-[18px] pb-10 pt-1.5">
      <TopBar volverA="/app/familia" eyebrow="Perfil a cargo" title={primerNombre} />

      <div className="flex items-center gap-3.5 rounded-[22px] bg-card p-[18px] shadow-card">
        <AvatarPersona nombre={miembro.nombre} color={color} size={60} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-heading text-[18px] font-extrabold tracking-[-0.02em]">{miembro.nombre}</div>
          <div className="mt-0.5 truncate text-[12px] font-medium text-subtle">{meta}</div>
        </div>
      </div>

      {(hoy.pendientes.length > 0 || hoy.noTomadas.length > 0) && (
        <HoyPendientes
          elderId={miembro.id}
          nombre={primerNombre}
          subtitulo={hoy.subtitulo}
          pendientes={hoy.pendientes}
          noTomadas={hoy.noTomadas}
          conectado={miembro.conectado}
          puedeRecordar={puedeEditar}
        />
      )}

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
            <span className="mt-0.5 block text-[11.5px] font-medium text-subtle">{resumenPrefsModoSimple(prefsSimple)}</span>
          </span>
          <VitaIcon name="chevron-right" size={17} className="shrink-0 text-faint" />
        </Link>
      </section>

      {puedeEditar && (
        <section>
          <h2 className="eyebrow px-1 pb-2.5 text-subtle">Contacto de emergencia</h2>
          <Link
            href={`/app/perfil/contacto-emergencia?persona=${id}`}
            className="flex items-center gap-3 rounded-[20px] bg-card px-4 py-[15px] shadow-card transition-transform active:scale-[0.99]"
          >
            <span className="flex size-[42px] shrink-0 items-center justify-center rounded-[14px] bg-chip-rose-bg text-chip-rose-ink">
              <VitaIcon name="phone" size={19} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-heading text-[14.5px] font-extrabold tracking-[-0.02em]">{emergencia || "Sin cargar"}</span>
              <span className="mt-0.5 block text-pretty text-[11.5px] font-medium text-subtle">
                {emergencia ? emergenciaSub : "A quien llama el botón Ayuda de su modo simple."}
              </span>
            </span>
            <span className="shrink-0 text-[12.5px] font-extrabold text-teal-deep">{emergencia ? "Editar" : "Agregar"}</span>
          </Link>
        </section>
      )}

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
        {cuidadores.length <= 1 && puedeInvitar && (
          <p className="px-1.5 pt-2.5 text-pretty text-[12px] font-medium leading-[1.5] text-subtle">
            Por ahora solo estás vos. Invitá a alguien para que también reciba los avisos.
          </p>
        )}
        {puedeInvitar && (
          <Link
            href={`/app/familia/invitar?persona=${id}`}
            className="mt-2.5 flex items-center justify-center gap-[7px] rounded-full bg-primary p-[15px] font-heading text-[14px] font-extrabold text-primary-foreground shadow-cta-sm active:scale-[0.98] motion-reduce:transform-none"
          >
            <VitaIcon name="plus" size={16} strokeWidth={2.6} />
            Invitar a un cuidador
          </Link>
        )}
      </section>

      {/* Propio de la app (no está en el diseño): sin esto no hay forma de cambiar nombre y color. */}
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
