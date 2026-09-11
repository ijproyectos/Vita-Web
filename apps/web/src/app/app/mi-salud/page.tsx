import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import * as perfilNucleo from "@/lib/perfil/nucleo";
import { VitaIcon } from "@/lib/vita-icons";
import { Chip } from "@/components/vita/chip";
import { colorChipPorIndice } from "@/lib/perfil/tipos";

export default async function MiSaludPage() {
  const usuario = await requireUser();
  const supabase = await createClient();
  const perfil = await perfilNucleo.obtenerPerfil(supabase, usuario.id);
  const condiciones = perfil?.condiciones ?? [];
  const alergias = perfil?.alergias ?? [];

  return (
    <div className="flex flex-col gap-5 px-4 pt-2">
      <div className="mt-1.5 flex items-center justify-between">
        <div>
          <div className="text-[12px] font-semibold uppercase tracking-wide text-primary">Historial</div>
          <div className="mt-0.5 font-heading text-[26px] font-extrabold tracking-tight">Mi Salud</div>
        </div>
        <Link
          href="/app/resumen-salud"
          aria-label="Editar perfil de salud"
          className="flex size-10 items-center justify-center rounded-full bg-card shadow-[var(--shadow-card,0_8px_24px_rgba(15,33,54,0.06))]"
        >
          <VitaIcon name="edit" size={18} />
        </Link>
      </div>

      {/* Mi estado */}
      <div className="rounded-[20px] bg-card p-4.5 shadow-[var(--shadow-card,0_8px_24px_rgba(15,33,54,0.06))]">
        <div className="font-heading text-[15px] font-bold">Mi estado</div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {condiciones.length} condiciones · {alergias.length} alergias
        </div>

        {condiciones.length > 0 && (
          <>
            <div className="mb-2 mt-3.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Condiciones</div>
            <div className="flex flex-wrap gap-2">
              {condiciones.map((c, i) => (
                <Chip key={c.label} color={colorChipPorIndice(i)}>
                  {c.label}
                </Chip>
              ))}
            </div>
          </>
        )}

        <div className="mb-2 mt-3.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Alergias</div>
        {alergias.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {alergias.map((a) => (
              <Chip key={a} color="rose">
                {a}
              </Chip>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Sin alergias cargadas.</p>
        )}

        <Link href="/app/resumen-salud" className="mt-3.5 inline-block text-sm font-semibold text-primary">
          Editar en Resumen de salud →
        </Link>
      </div>

      {/* Monitoreo activo — sin datos reales todavía, no se fabrican números */}
      <SeccionProximamente
        titulo="Monitoreo activo"
        descripcion="Presión, glucemia y peso — próximamente vas a poder registrarlos acá y ver su evolución."
      />

      {/* Historial (estudios/vacunas/consultas/mediciones) — no hay pantalla
          de alta para ninguno de estos en el diseño real, tampoco se
          fabrica acá. */}
      <SeccionProximamente
        titulo="Historial"
        descripcion="Estudios, vacunas y consultas van a aparecer acá a medida que los cargues o vita los detecte."
      />
    </div>
  );
}

function SeccionProximamente({ titulo, descripcion }: { titulo: string; descripcion: string }) {
  return (
    <div>
      <div className="px-0.5 pb-2.5 font-heading text-[15px] font-bold">{titulo}</div>
      <div className="rounded-[20px] bg-secondary p-5 text-center">
        <p className="text-sm text-muted-foreground">{descripcion}</p>
      </div>
    </div>
  );
}
