import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { VitaIcon } from "@/lib/vita-icons";
import { obtenerPrefs } from "@/lib/modo-simple/nucleo";
import { turnoParaMostrar } from "@/lib/modo-simple/datos";
import { TarjetaTurno } from "@/components/vita/modo-simple/piezas";

// Turno del modo simple en pantalla propia: se abre desde la fila chica de la
// principal (cuando hay algo pendiente arriba). Lo mismo que la tarjeta grande,
// nada más. Sin turno a la vista (ya pasó, o la sección está apagada), vuelve.
export default async function TurnoSimplePage(props: PageProps<"/app/modo-simple/turno">) {
  const params = await props.searchParams;
  // Desde "Tu rutina de hoy" vuelve ahí; si no, a la principal.
  const volver = params?.desde === "rutina" ? "/app/modo-simple/rutina" : "/app/modo-simple";
  const usuario = await requireUser();
  const supabase = await createClient();
  const config = await obtenerPrefs(supabase, usuario.id);
  const turno = config.ver_turnos ? await turnoParaMostrar(supabase, usuario.id) : null;
  if (!turno) redirect("/app/modo-simple");

  return (
    <main className="min-h-dvh bg-canvas px-5 pb-12 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <Link
        href={volver}
        className="inline-flex h-14 items-center gap-2 rounded-full bg-card px-5 text-[18px] font-bold shadow-item"
      >
        <VitaIcon name="chevron-left" size={22} />
        Volver
      </Link>
      <div className="mt-6">
        <TarjetaTurno turno={turno} />
      </div>
    </main>
  );
}
