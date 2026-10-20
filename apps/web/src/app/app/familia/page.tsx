import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import * as familiaNucleo from "@/lib/familia/nucleo";
import { colorPorDefecto } from "@/lib/familia/colores";
import { ETIQUETA_ROL } from "@/lib/familia/tipos";
import { AvatarPersona } from "@/components/vita/avatar-persona";
import { VitaIcon } from "@/lib/vita-icons";
import { TopBar } from "../top-bar";
import { RolCuidador } from "./rol-cuidador";

// V7 "familia" (Familia y permisos): a quién cuido (perfiles a cargo, con su
// permiso) y quién me cuida (con el permiso que YO le doy). Ver
// supabase/migrations/021_familia.sql y lib/familia/.
export default async function FamiliaPage() {
  await requireUser();
  const supabase = await createClient();
  const [familia, cuidadores] = await Promise.all([
    familiaNucleo.listarFamilia(supabase),
    familiaNucleo.listarMisCuidadores(supabase),
  ]);

  return (
    <div className="flex flex-col gap-[22px] px-[18px] pb-10 pt-1.5">
      <TopBar eyebrow="Familia" title="Familia y permisos" />

      <section>
        <h2 className="px-0.5 pb-[9px] font-heading text-[17px] font-extrabold tracking-[-0.03em]">Perfiles a cargo</h2>
        {familia.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-[20px] bg-card px-5 pb-[22px] pt-[26px] text-center shadow-card">
            <div className="flex size-12 items-center justify-center rounded-full bg-persona-violeta-tint text-persona-violeta">
              <VitaIcon name="users" size={22} />
            </div>
            <div className="mt-0.5 font-heading text-[15px] font-extrabold tracking-[-0.02em]">Todavía no cuidás a nadie</div>
            <div className="max-w-[280px] text-[12.5px] font-medium leading-[1.45] text-subtle text-balance">
              Sumá el perfil de alguien de tu familia para llevar sus remedios y turnos.
            </div>
          </div>
        ) : (
          <ul className="overflow-hidden rounded-[20px] bg-card shadow-card">
            {familia.map((m, i) => (
              <li key={m.vinculoId} className={i > 0 ? "border-t border-foreground/[0.06]" : ""}>
                <Link href={`/app/familia/${m.id}`} className="flex items-center gap-3 px-4 py-3.5">
                  <AvatarPersona nombre={m.nombre} color={m.color ?? colorPorDefecto(i)} size={42} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-heading text-[15px] font-extrabold tracking-[-0.02em]">{m.nombre}</div>
                    <div className="mt-0.5 truncate text-[11.5px] font-medium text-subtle">
                      {[m.relacion, m.conectado ? "Usa su celular" : "Todavía no conectó su celular"]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-bold text-slate-brand">
                    {ETIQUETA_ROL[m.rol].titulo}
                  </span>
                  <VitaIcon name="chevron-right" size={17} className="shrink-0 text-faint" />
                </Link>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex flex-col gap-2">
          <Link
            href="/app/familia/nuevo"
            className="flex items-center justify-center gap-2 rounded-full bg-primary py-[14px] font-heading text-sm font-extrabold text-primary-foreground"
          >
            <VitaIcon name="plus" size={16} strokeWidth={2.6} />
            Crear un perfil
          </Link>
          <Link
            href="/onboarding/vincular-cuidado"
            className="flex items-center justify-center gap-2 rounded-full bg-card py-[14px] font-heading text-sm font-extrabold text-teal-deep shadow-item"
          >
            <VitaIcon name="link" size={16} />
            Vincular con un código
          </Link>
        </div>
        <p className="px-1 pt-2 text-[11.5px] font-medium leading-[1.45] text-subtle">
          Creá un perfil si la persona no usa celular: llevás sus remedios desde tu app. Si tiene celular, vinculate con un
          código.
        </p>
      </section>

      <section>
        <h2 className="px-0.5 pb-[9px] font-heading text-[17px] font-extrabold tracking-[-0.03em]">Te cuidan</h2>
        {cuidadores.length === 0 ? (
          <div className="rounded-[20px] bg-card p-[18px] text-[13px] font-medium leading-[1.45] text-subtle shadow-card">
            Por ahora nadie te cuida en vita. Invitá a alguien para que también vea tus remedios y reciba los avisos.
          </div>
        ) : (
          <ul className="overflow-hidden rounded-[20px] bg-card shadow-card">
            {cuidadores.map((c, i) => (
              <li key={c.vinculoId} className={"px-4 py-3.5 " + (i > 0 ? "border-t border-foreground/[0.06]" : "")}>
                <div className="flex items-center gap-3">
                  <AvatarPersona nombre={c.nombre} color={colorPorDefecto(i + 1)} size={42} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-heading text-[15px] font-extrabold tracking-[-0.02em]">{c.nombre}</div>
                    <div className="mt-0.5 truncate text-[11.5px] font-medium text-subtle">
                      {c.relacion ?? "Te cuida"}
                    </div>
                  </div>
                </div>
                <RolCuidador vinculoId={c.vinculoId} rol={c.rol} nombre={c.nombre} />
              </li>
            ))}
          </ul>
        )}
        <Link
          href="/app/perfil/cuidadores"
          className="mt-3 flex items-center justify-center gap-2 rounded-full bg-card py-[14px] font-heading text-sm font-extrabold text-teal-deep shadow-item"
        >
          <VitaIcon name="user-plus" size={16} />
          Invitar a alguien que me cuide
        </Link>
      </section>
    </div>
  );
}
