import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import * as medicamentos from "@/lib/medicamentos/nucleo";
import { filasHoy, proximoGrupoPendiente } from "@/lib/modo-simple/seleccion";
import { VitaIcon } from "@/lib/vita-icons";
import { ListaHoyInteractiva } from "../lista-hoy";
import { conRespaldo } from "@/lib/con-respaldo";
import { obtenerPrefs } from "@/lib/modo-simple/nucleo";
import { medicionesParaMostrar, turnoParaMostrar } from "@/lib/modo-simple/datos";
import { TarjetaMedicionesEnlace, TarjetaTurno } from "./tarjetas";


// "Tu rutina de hoy" del modo simple: todas las tomas del día con su estado,
// con la forma de la Rutina del modo normal. Se llega desde "Ver rutina
// completa" o desde el aviso "Se te pasó…" (`?abrir=<id>` abre esa pastilla).
// Es siempre de la cuenta logueada, como todo el modo simple.
export default async function RutinaSimplePage(props: PageProps<"/app/modo-simple/rutina">) {
  const usuario = await requireUser();
  const supabase = await createClient();
  const params = await props.searchParams;
  const abrir = Array.isArray(params?.abrir) ? params.abrir[0] : params?.abrir;

  const hoy = await medicamentos.listarHoy(supabase, usuario.id);
  const omitidas = await medicamentos.idsOmitidas(supabase, hoy.map((m) => m.id), medicamentos.fechaEnAR());
  const ahora = medicamentos.horaEnAR();
  const { enGrupo } = proximoGrupoPendiente(hoy.filter((m) => !omitidas.has(m.id)), ahora);
  const filas = filasHoy(hoy, omitidas, new Set(enGrupo.map((m) => m.id)), ahora);
  // Lo mismo que la pantalla principal muestra de turnos y mediciones (y con la misma configuración).
  const config = await obtenerPrefs(supabase, usuario.id);
  const [turno, mediciones] = await Promise.all([
    config.ver_turnos ? conRespaldo(turnoParaMostrar(supabase, usuario.id), null) : null,
    config.ver_mediciones ? conRespaldo(medicionesParaMostrar(supabase, usuario.id), null) : null,
  ]);

  return (
    <main className="min-h-dvh bg-canvas px-5 pb-12 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <Link
        href="/app/modo-simple"
        className="inline-flex h-14 items-center gap-2 rounded-full bg-card px-5 text-[18px] font-bold shadow-item"
      >
        <VitaIcon name="chevron-left" size={22} />
        Volver
      </Link>
      <h1 className="mt-6 font-heading text-[32px] font-extrabold leading-tight tracking-[-0.035em]">Tu rutina de hoy</h1>
      <div className="mt-5">
        {filas.length > 0 ? (
          <ListaHoyInteractiva filas={filas} abrirId={abrir ?? null} />
        ) : (
          <p className="text-[19px] font-semibold text-slate-brand">Hoy no tenés pastillas cargadas.</p>
        )}
      </div>
      {(turno || mediciones) && (
        <div className="mt-6 flex flex-col gap-4">
          {turno && <TarjetaTurno turno={turno} />}
          {mediciones && <TarjetaMedicionesEnlace titulo={mediciones.titulo} mediciones={mediciones.items} />}
        </div>
      )}
    </main>
  );
}
