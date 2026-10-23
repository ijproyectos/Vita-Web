import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import * as familiaNucleo from "@/lib/familia/nucleo";
import * as perfilNucleo from "@/lib/perfil/nucleo";
import { obtenerPerfilActivo } from "@/lib/familia/perfil-activo";
import { colorPorDefecto } from "@/lib/familia/colores";
import { AvatarPersona } from "@/components/vita/avatar-persona";
import { FilaCuidador } from "@/components/vita/fila-cuidador";
import { TarjetaVitaPlus } from "@/components/vita/tarjeta-vita-plus";
import { VitaIcon } from "@/lib/vita-icons";
import { TopBar } from "../top-bar";

// V7 "familia" (Familia y permisos): vita+, los perfiles a cargo y los
// cuidadores de la persona que se está mirando (el perfil activo), con
// "Invitar a un cuidador". Ver supabase/migrations/021 y 027.
const ETIQUETA_SECCION = "px-0.5 pb-2.5 eyebrow text-subtle";

export default async function FamiliaPage() {
  const usuario = await requireUser();
  const supabase = await createClient();
  const activo = await obtenerPerfilActivo();
  const familia = await familiaNucleo.listarFamilia(supabase);
  const { lista: cuidadores, completa } = await familiaNucleo.cuidadoresDePersona(supabase, {
    personaId: activo.id,
    usuarioId: usuario.id,
    miNombre: activo.esPropio ? "Vos" : (await perfilNucleo.obtenerNombre(supabase, usuario.id)),
    miRol: activo.rol,
    esPropio: activo.esPropio,
  });

  const primerNombre = activo.nombre.split(" ")[0];
  const soloYo = cuidadores.length === 1 && cuidadores[0].esYo;
  const nadie = cuidadores.length === 0;
  const puedeInvitar = activo.esPropio || (completa && cuidadores.some((c) => c.puedeGestionar));

  return (
    <div className="flex flex-col gap-5 px-[18px] pb-10 pt-1.5">
      <TopBar volverA="/app/perfil" eyebrow="Familia" title="Familia y permisos" />

      <TarjetaVitaPlus />

      <section>
        <h2 className={ETIQUETA_SECCION}>Perfiles a cargo</h2>
        {familia.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-[20px] bg-card px-5 pb-[22px] pt-[26px] text-center shadow-card">
            <div className="flex size-12 items-center justify-center rounded-full bg-chip-teal-bg text-teal-deep">
              <VitaIcon name="users" size={22} />
            </div>
            <div className="mt-0.5 font-heading text-[15px] font-extrabold tracking-[-0.02em]">Todavía no cuidás a nadie</div>
            <div className="max-w-[280px] text-pretty text-[12.5px] font-medium leading-[1.45] text-subtle">
              Sumá el perfil de alguien de tu familia para llevar sus remedios y turnos.
            </div>
            <Link
              href="/app/familia/nuevo"
              className="mt-2 rounded-full bg-primary px-5 py-[11px] font-heading text-[13.5px] font-extrabold text-primary-foreground shadow-cta"
            >
              Agregar un perfil
            </Link>
          </div>
        ) : (
          <ul className="overflow-hidden rounded-[20px] bg-card shadow-card">
            {familia.map((m, i) => (
              <li key={m.vinculoId} className={i > 0 ? "border-t border-foreground/[0.06]" : ""}>
                <Link href={`/app/familia/${m.id}`} className="flex items-center gap-[13px] px-4 py-3.5 transition-colors hover:bg-foreground/[0.02]">
                  <AvatarPersona nombre={m.nombre} color={m.color ?? colorPorDefecto(i)} size={42} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-heading text-[14.5px] font-extrabold tracking-[-0.02em]">{m.nombre}</div>
                    <div className="mt-0.5 truncate text-[11.5px] font-medium text-subtle">
                      {m.conectado ? "Modo simple · celular conectado" : "Todavía no conectó su celular"}
                    </div>
                  </div>
                  {m.rol === "ver" && (
                    <span className="shrink-0 rounded-full bg-secondary px-2.5 py-[5px] text-[11.5px] font-extrabold text-slate-brand">
                      Lector
                    </span>
                  )}
                  <VitaIcon name="chevron-right" size={17} className="shrink-0 text-faint" />
                </Link>
              </li>
            ))}
          </ul>
        )}
        {familia.length > 0 && (
          // Propio de la app (no está en el diseño): /cuidar tiene lo que Familia
          // no — "Recordarle" una dosis y las dosis vencidas de todas las
          // personas a cargo en un solo lugar. Es a donde llevan los avisos push.
          <Link
            href="/cuidar"
            className="mt-2.5 flex items-center gap-3 rounded-[20px] bg-card px-4 py-3.5 shadow-card transition-colors hover:bg-foreground/[0.02]"
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-chip-teal-bg text-teal-deep">
              <VitaIcon name="activity" size={17} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-heading text-[14px] font-extrabold tracking-[-0.02em]">Panel de cuidador</div>
              <div className="mt-0.5 text-[11.5px] font-medium text-subtle">Dosis pendientes y recordatorios de todos</div>
            </div>
            <VitaIcon name="chevron-right" size={17} className="shrink-0 text-faint" />
          </Link>
        )}
      </section>

      <section>
        <h2 className={ETIQUETA_SECCION}>{activo.esPropio ? "Cuidadores" : `Cuidadores de ${primerNombre}`}</h2>
        {nadie ? (
          <div className="rounded-[20px] bg-card p-[18px] text-[13px] font-medium leading-[1.45] text-subtle shadow-card">
            Por ahora nadie te cuida en vita.
          </div>
        ) : (
          <ul className="overflow-hidden rounded-[20px] bg-card shadow-card">
            {cuidadores.map((c, i) => (
              <li key={c.vinculoId || c.cuidadorId}>
                <FilaCuidador
                  cuidador={c}
                  indice={i + 1}
                  primera={i === 0}
                  personaNombre={primerNombre}
                  href={c.esYo || !c.vinculoId ? undefined : `/app/familia/${activo.id}/cuidadores/${c.vinculoId}`}
                />
              </li>
            ))}
          </ul>
        )}
        {(soloYo || nadie) && (
          <p className="px-1 pt-2.5 text-pretty text-[12.5px] font-medium leading-[1.45] text-subtle">
            {activo.esPropio
              ? "Invitá a alguien para que vea tus remedios y reciba tus avisos."
              : "Por ahora sos la única. Invitá a alguien para que también reciba los avisos."}
          </p>
        )}
      </section>

      <div className="flex flex-col gap-2">
        {puedeInvitar && (
          <Link
            href={`/app/familia/invitar?persona=${activo.id}`}
            className="flex items-center justify-center gap-2 rounded-full bg-primary py-[15px] font-heading text-[14.5px] font-extrabold text-primary-foreground shadow-cta transition-transform active:scale-[0.98]"
          >
            <VitaIcon name="plus" size={16} strokeWidth={2.6} />
            Invitar a un cuidador
          </Link>
        )}
        {/* Propio de la app (no está en el diseño): */}
        <Link
          href="/app/familia/nuevo"
          className="flex items-center justify-center gap-2 rounded-full bg-card py-[14px] font-heading text-sm font-extrabold text-teal-deep shadow-item"
        >
          <VitaIcon name="user-plus" size={16} />
          Crear un perfil
        </Link>
        <Link
          href="/onboarding/vincular-cuidado"
          className="flex items-center justify-center gap-2 rounded-full bg-card py-[14px] font-heading text-sm font-extrabold text-teal-deep shadow-item"
        >
          <VitaIcon name="link" size={16} />
          Vincular con un código
        </Link>
        <p className="px-1 pt-1 text-pretty text-[11.5px] font-medium leading-[1.45] text-subtle">
          Creá un perfil si la persona no usa celular: llevás sus remedios desde tu app. Si tiene celular, vinculate con un
          código.
        </p>
      </div>
    </div>
  );
}
