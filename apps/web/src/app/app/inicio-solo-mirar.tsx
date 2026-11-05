import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import * as medicamentos from "@/lib/medicamentos/nucleo";
import * as turnosNucleo from "@/lib/turnos/nucleo";
import * as perfilNucleo from "@/lib/perfil/nucleo";
import { listarCuidadoresDe, listarFamilia } from "@/lib/familia/nucleo";
import { unicoAdmin } from "@/lib/familia/solo-mirar";
import type { OpcionPerfil, PerfilActivo } from "@/lib/familia/tipos";
import { contadorDeHoy, ETIQUETA_ESTADO_TOMA, filasTomas, type EstadoToma } from "@/lib/medicamentos/estado-toma";
import { textoDosis } from "@/lib/medicamentos/tipos";
import { esEmailDeCuentaPorCodigo } from "@/lib/acceso-codigo/tipos";
import { etiquetaDia } from "@/lib/rutina/formato";
import { iconoDeEspecialidad } from "@/lib/turnos/icono";
import { cn } from "@/lib/utils";
import { VitaIcon } from "@/lib/vita-icons";
import { EncabezadoPerfil } from "@/components/vita/encabezado-perfil";
import { InstalarVita } from "@/components/vita/instalar-vita";
import { TarjetaAvisosApagados } from "@/components/vita/tarjeta-avisos-apagados";
import { AjustesSoloMirar } from "./ajustes-solo-mirar";

const CLASES_ESTADO: Record<EstadoToma, string> = {
  tomada: "bg-persona-1-tint text-teal-deep",
  "sin-confirmar": "bg-aviso-tint text-aviso-ink",
  "mas-tarde": "bg-secondary text-slate-brand",
};

// Inicio "solo mirar" (B6): lo que ve un Lector del perfil de otra persona.
// Sin menú de abajo ni acciones: solo sus tomas, turnos y su salud. Los datos
// son los del perfil activo; la RLS decide qué filas llegan.
export async function InicioSoloMirar({
  usuario,
  activo,
  opciones,
}: {
  usuario: { id: string; email?: string | null };
  activo: PerfilActivo;
  opciones: OpcionPerfil[];
}) {
  const supabase = await createClient();
  const pid = activo.id;
  const [perfil, miPerfil, medsHoy, deAyer, turnos, cuidadores, familia] = await Promise.all([
    perfilNucleo.obtenerPerfil(supabase, pid).catch(() => null),
    perfilNucleo.obtenerPerfil(supabase, usuario.id).catch(() => undefined),
    medicamentos.listarHoy(supabase, pid),
    medicamentos.listarVencidasDeAyer(supabase, pid),
    turnosNucleo.listarProximos(supabase, pid, 5),
    // Lecturas secundarias: si fallan, la página sigue sin el nombre del Admin ni "Dejar de cuidar".
    listarCuidadoresDe(supabase, pid).catch(() => null),
    listarFamilia(supabase).catch(() => null),
  ]);

  const nombre = activo.nombre.split(" ")[0];
  const admin = unicoAdmin(cuidadores);
  const vinculoId = (familia ?? []).find((m) => m.id === pid)?.vinculoId ?? null;

  const aTomas = (m: { id: string; nombre: string; hora_programada: string }, tomado: boolean) => ({
    id: m.id,
    nombre: m.nombre,
    dosis: "",
    hora: m.hora_programada.slice(0, 5),
    tomado,
  });
  const filas = filasTomas(
    medsHoy.map((m) => ({ ...aTomas(m, m.tomado), dosis: textoDosis(m) })),
    deAyer.map((m) => ({ ...aTomas(m, false), dosis: textoDosis(m) })),
    medicamentos.horaEnAR()
  );
  const contador = contadorDeHoy(filas);

  const condiciones = perfil?.condiciones.length ?? 0;
  const alergias = perfil?.alergias.length ?? 0;
  const grupo = perfil?.grupo_sanguineo?.trim();
  const resumenSalud = [
    condiciones > 0 && `${condiciones} ${condiciones === 1 ? "condición" : "condiciones"}`,
    alergias > 0 && `${alergias} ${alergias === 1 ? "alergia" : "alergias"}`,
    grupo && `Grupo ${grupo}`,
  ]
    .filter(Boolean)
    .join(" · ");

  // undefined = la lectura falló: ante la duda no se ofrece armar el perfil.
  const sinPerfilPropio = miPerfil !== undefined && !miPerfil?.onboarding_completado_at;

  return (
    <div className="flex flex-col gap-[22px] px-[18px] pb-6 pt-1.5">
      <InstalarVita />

      <EncabezadoPerfil
        perfil={activo}
        opciones={opciones}
        nombre={nombre}
        eyebrowSelector="Estás viendo a"
        estatico={{ eyebrow: "Estás viendo a", titulo: nombre }}
        pie={
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-card px-[11px] py-[5px] text-[12.5px] font-extrabold text-slate-brand shadow-card">
            <VitaIcon name="eye" size={13} strokeWidth={2.2} />
            {admin ? `Solo mirás · lo cuida ${admin}` : "Solo mirás"}
          </div>
        }
      />

      <TarjetaAvisosApagados />

      <Link href="/app/resumen-salud" className="flex items-center justify-between gap-3 rounded-[20px] bg-card p-[18px] shadow-card">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-tile)] bg-chip-rose-bg text-chip-rose-ink">
            <VitaIcon name="heart" size={20} />
          </div>
          <div className="min-w-0">
            <div className="truncate font-heading text-[16px] font-extrabold tracking-[-0.02em]">Salud de {nombre}</div>
            <div className="mt-0.5 truncate text-[11.5px] font-medium text-subtle">{resumenSalud || "Ver resumen de salud"}</div>
          </div>
        </div>
        <VitaIcon name="chevron-right" size={18} className="shrink-0 text-faint" />
      </Link>

      <section>
        <div className="flex items-baseline justify-between px-0.5 pb-[11px]">
          <h2 className="font-heading text-base font-extrabold tracking-[-0.02em]">Tomas de hoy</h2>
          {contador && (
            <span className="text-[12.5px] font-bold text-subtle">
              {contador.tomadas} de {contador.total} {contador.tomadas === 1 ? "tomada" : "tomadas"}
            </span>
          )}
        </div>
        {filas.length === 0 ? (
          <Vacio texto="Hoy no tiene tomas programadas." />
        ) : (
          <ul className="overflow-hidden rounded-[20px] bg-card shadow-card">
            {filas.map((f) => (
              <li
                key={`${f.deAyer ? "ayer-" : ""}${f.id}`}
                className="flex items-center gap-3 px-4 py-3.5 [&:not(:first-child)]:border-t [&:not(:first-child)]:border-foreground/[0.06]"
              >
                <div className="w-[46px] shrink-0 text-[13px] font-bold tabular-nums text-slate-brand">{f.hora}</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-heading text-[14.5px] font-extrabold tracking-[-0.02em]">{f.nombre}</div>
                  <div className="mt-0.5 truncate text-[11.5px] font-medium text-subtle">
                    {[f.dosis, f.deAyer && "De ayer"].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-extrabold", CLASES_ESTADO[f.estado])}>
                  {ETIQUETA_ESTADO_TOMA[f.estado]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="px-0.5 pb-[11px] font-heading text-base font-extrabold tracking-[-0.02em]">Próximos turnos</h2>
        {turnos.length === 0 ? (
          <Vacio texto="Todavía no hay turnos cargados." />
        ) : (
          <ul className="overflow-hidden rounded-[20px] bg-card shadow-card">
            {turnos.map((t) => (
              <li
                key={t.id}
                className="flex items-center gap-3 px-4 py-3.5 [&:not(:first-child)]:border-t [&:not(:first-child)]:border-foreground/[0.06]"
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-tile)] bg-persona-1-tint text-teal-deep">
                  <VitaIcon name={iconoDeEspecialidad(t.especialidad)} size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-heading text-[14.5px] font-extrabold tracking-[-0.02em]">{t.especialidad}</div>
                  <div className="mt-0.5 truncate text-[11.5px] font-medium text-subtle">
                    {[t.profesional, t.lugar].filter(Boolean).join(" · ") || " "}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[11.5px] font-extrabold uppercase text-slate-brand">{etiquetaDia(t.fecha)}</div>
                  <div className="text-[11.5px] font-bold tabular-nums text-subtle">{t.hora} hs</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {sinPerfilPropio && (
        <Link
          href="/onboarding/para-quien"
          className="flex items-center gap-3 rounded-[20px] bg-card p-[18px] shadow-card"
        >
          <div className="min-w-0 flex-1">
            <div className="font-heading text-[15.5px] font-extrabold tracking-[-0.02em]">¿Querés llevar tu salud también?</div>
            <div className="mt-0.5 text-[12.5px] font-medium text-subtle">Armá tu perfil con la misma cuenta.</div>
          </div>
          <VitaIcon name="chevron-right" size={18} className="shrink-0 text-faint" />
        </Link>
      )}

      <AjustesSoloMirar
        key={activo.id}
        nombre={nombre}
        vinculoId={vinculoId}
        sub={esEmailDeCuentaPorCodigo(usuario.email) ? "Volvés a entrar con el código de tu familiar" : "Volvés a entrar con Google o con tu mail"}
      />
    </div>
  );
}

function Vacio({ texto }: { texto: string }) {
  return <div className="rounded-[20px] bg-card px-5 py-5 text-center text-[13.5px] font-medium text-subtle shadow-card">{texto}</div>;
}
