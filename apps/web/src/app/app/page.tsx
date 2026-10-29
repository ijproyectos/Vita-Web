import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_MODO_SIMPLE } from "@/lib/modo-simple/recordar";
import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import * as medicamentos from "@/lib/medicamentos/nucleo";
import * as turnosNucleo from "@/lib/turnos/nucleo";
import * as perfilNucleo from "@/lib/perfil/nucleo";
import * as inventarioNucleo from "@/lib/inventario/nucleo";
import { AvisoRecordatorio } from "@/components/vita/aviso-recordatorio";
import { InstalarVita } from "@/components/vita/instalar-vita";
import { NudgeVita } from "@/components/vita/nudge-vita";
import { listarRecordatoriosPendientes } from "@/lib/notificaciones/recordatorios";
import { contarNoLeidos } from "@/lib/notificaciones/avisos";
import { fechaConOffset, fechaDeHoyISO, formatoFechaCorta, saludoEnAR } from "@/lib/rutina/formato";
import { VitaIcon } from "@/lib/vita-icons";
import { obtenerOpcionesPerfil, obtenerPerfilActivo } from "@/lib/familia/perfil-activo";
import { EncabezadoPerfil, PastillaLector } from "@/components/vita/encabezado-perfil";
import { TarjetaAvisosApagados } from "@/components/vita/tarjeta-avisos-apagados";
import { TarjetaDosisVencida, type DosisVencida } from "@/components/vita/tarjeta-dosis-vencida";
import { TarjetaEmpecemos } from "@/components/vita/tarjeta-empecemos";
import { TiraStock, type ItemStockBajo } from "@/components/vita/tira-stock";
import { indicacionDeComida, textoDosis } from "@/lib/medicamentos/tipos";
import { AvatarPersona } from "@/components/vita/avatar-persona";
import { nombreConMayuscula } from "@/lib/perfil/formato";
import { TurnosHome } from "./turnos-home";

export default async function HomePage() {
  const usuario = await requireUser();
  // Abrir la app con el modo simple activo en este dispositivo vuelve ahí,
  // no al Inicio normal (se apaga con "Salir del modo simple").
  if ((await cookies()).get(COOKIE_MODO_SIMPLE)?.value === "1") redirect("/app/modo-simple");
  const supabase = await createClient();
  // Familia: los datos son del perfil activo (propio o de alguien que cuido);
  // los avisos y el nudge a vita son siempre de la cuenta logueada.
  const [activo, opciones] = await Promise.all([obtenerPerfilActivo(), obtenerOpcionesPerfil()]);
  const pid = activo.id;
  const puedeEditar = activo.rol === "editar";

  const [perfil, medsHoy, todosLosMeds, adherencia, turnosProximos, grupos, noLeidos] = await Promise.all([
    perfilNucleo.obtenerPerfil(supabase, pid),
    medicamentos.listarHoy(supabase, pid),
    medicamentos.listarTodos(supabase, pid),
    medicamentos.calcularAdherencia(supabase, pid),
    turnosNucleo.listarProximos(supabase, pid, 5),
    inventarioNucleo.listarGruposSeguro(supabase, pid),
    contarNoLeidos(supabase, usuario.id),
  ]);

  // Los recordatorios ("te recordó X") son para la persona logueada.
  const recordatorios = activo.esPropio ? await listarRecordatoriosPendientes(supabase, usuario.id, medsHoy) : [];

  // Tira de poco stock (V7): el medicamento con menos pastillas, "alcanzan hasta el jueves".
  const stockBajo: ItemStockBajo[] = grupos
    .filter((g) => g.inventario && g.inventario.stock < g.inventario.umbral_alerta)
    .sort((a, b) => a.inventario!.stock - b.inventario!.stock)
    .map((g) => {
      const dias = inventarioNucleo.diasQueAlcanza(g);
      return {
        medicamentoId: g.representanteId,
        nombre: g.nombre,
        stock: g.inventario!.stock,
        hasta: dias === null ? null : nombreDelDia(fechaConOffset(dias)),
      };
    });

  // Dosis de hoy que ya pasaron de hora sin marcar.
  const ahora = medicamentos.horaEnAR();
  const deAyer = await medicamentos.listarVencidasDeAyer(supabase, pid);
  const vencidas: DosisVencida[] = [
    // Hasta las 00:30 AR, las de ayer que quedaron sin tomar van primero.
    ...[...deAyer]
      .sort((a, b) => a.hora_programada.localeCompare(b.hora_programada))
      .map((m) => ({ id: m.id, nombre: m.nombre, dosis: textoDosis(m), hora: m.hora_programada.slice(0, 5), deAyer: true, fecha: medicamentos.fechaAyerEnAR() })),
    ...[...medsHoy]
      .sort((a, b) => a.hora_programada.localeCompare(b.hora_programada))
      .filter((m) => !m.tomado && medicamentos.esDosisVencida(m.hora_programada, ahora, 0))
      .map((m) => ({ id: m.id, nombre: m.nombre, dosis: textoDosis(m), hora: m.hora_programada.slice(0, 5) })),
  ];

  // Primera vez: ni remedios ni turnos cargados.
  const primeraVez = todosLosMeds.length === 0 && turnosProximos.length === 0;

  // activo.nombre is already capitalized (perfil-activo.ts).
  const nombreCompleto = perfil?.nombre?.trim() ? nombreConMayuscula(perfil.nombre) : activo.nombre;
  const nombre = nombreCompleto.split(" ")[0];
  // El punto de la campana es la cuenta de avisos sin leer del centro (/app/avisos).
  const hayAvisos = noLeidos > 0;

  // Adherencia de hoy: un segmento por toma, en orden horario. "Sigue" es la
  // primera toma sin marcar.
  const tomas = [...medsHoy].sort((a, b) => a.hora_programada.localeCompare(b.hora_programada));
  const tomados = tomas.filter((m) => m.tomado).length;
  const siguiente = tomas.find((m) => !m.tomado);
  const textoSigue =
    tomas.length === 0
      ? activo.esPropio ? "No tenés medicamentos programados para hoy." : `${nombre} no tiene medicamentos programados para hoy.`
      : siguiente
        ? `Sigue: ${siguiente.nombre} a las ${siguiente.hora_programada.slice(0, 5)}${indicacionDeComida(siguiente) ? ` · ${indicacionDeComida(siguiente)}` : ""}`
        : "Listo por hoy. No queda nada pendiente.";

  return (
    <div className="flex flex-col gap-[22px] px-[18px] pt-1.5">
      <InstalarVita />

      {/* Saludo + selector de perfil + avisos */}
      <EncabezadoPerfil
        perfil={activo}
        opciones={opciones}
        nombre={nombre}
        eyebrowSelector={activo.esPropio ? `${saludoEnAR()},` : "Estás viendo a"}
        estatico={{ eyebrow: `${saludoEnAR()},`, titulo: `${nombre} 👋`, eyebrowClassName: "text-subtle" }}
        pie={!puedeEditar ? <PastillaLector /> : undefined}
        accion={
          <Link
            href="/app/avisos"
            aria-label={hayAvisos ? "Avisos, hay novedades" : "Avisos"}
            className="relative flex size-[42px] shrink-0 items-center justify-center rounded-full bg-card text-slate-brand shadow-card transition-transform active:scale-[0.94] motion-reduce:transition-none"
          >
            <VitaIcon name="bell" size={19} strokeWidth={1.9} />
            {hayAvisos && <span className="absolute right-[11px] top-2.5 size-2 rounded-full bg-primary ring-2 ring-card" />}
          </Link>
        }
      />

      {activo.esPropio && <TarjetaAvisosApagados />}

      <AvisoRecordatorio items={recordatorios} href="/app/modo-simple" />

      <TarjetaDosisVencida vencidas={vencidas} puedeEditar={puedeEditar} />

      {/* Tarjeta de perfil */}
      <Link href="/app/resumen-salud" className="flex items-center justify-between rounded-[20px] bg-card p-[18px] shadow-card">
        <div className="flex items-center gap-3">
          <AvatarPersona nombre={nombreCompleto} color={activo.color} size={52} />
          <div className="min-w-0">
            <div className="truncate font-heading text-[16.5px] font-extrabold tracking-[-0.02em]">
              {nombreCompleto}
            </div>
            <div className="mt-0.5 text-[11.5px] font-medium text-subtle">
              {activo.esPropio ? "Resumen de salud" : puedeEditar ? "A tu cargo · Resumen de salud" : "Solo ver · Resumen de salud"}
            </div>
          </div>
        </div>
        <VitaIcon name="chevron-right" size={18} className="shrink-0 text-faint" />
      </Link>

      {primeraVez ? (
        <TarjetaEmpecemos
          titulo={activo.esPropio ? "Contame qué remedios tomás" : `Contame qué remedios toma ${nombre}`}
          puedeEditar={puedeEditar}
        />
      ) : (
        <>
      {/* Adherencia de hoy */}
      <Link
        href="/app/rutina"
        className="rounded-[20px] bg-teal-deep px-[18px] pb-4 pt-[18px] text-primary-foreground transition-transform active:scale-[0.99] motion-reduce:transition-none"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="text-[13px] font-semibold">Hoy, {formatoFechaCorta(fechaDeHoyISO())}</div>
          <div className="flex items-center gap-0.5 text-[13px] font-bold">
            Rutina
            <VitaIcon name="chevron-right" size={15} strokeWidth={2.4} />
          </div>
        </div>
        <div className="mt-2 font-heading text-2xl font-extrabold leading-[1.15] tracking-[-0.025em]">
          {tomados} de {tomas.length} tomados
        </div>
        {tomas.length > 0 && (
          <div className="mt-3.5 flex gap-1" aria-hidden>
            {tomas.map((m) => (
              <div key={m.id} className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div
                  className={
                    "h-1.5 rounded-[3px] " +
                    (m.tomado ? "bg-primary-foreground" : "bg-primary-foreground/25")
                  }
                />
                <div
                  className={
                    "text-[11px] font-bold tabular-nums " +
                    (m.tomado ? "text-primary-foreground" : "text-primary-foreground/60")
                  }
                >
                  {m.hora_programada.slice(0, 5)}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-3 border-t border-primary-foreground/[0.18] pt-3 text-[13.5px] font-semibold leading-[1.4]">
          {textoSigue}
        </div>
        {adherencia.rachaDias > 0 && (
          <div className="mt-1.5 flex items-center gap-1 text-[12px] font-medium text-primary-foreground/80">
            <VitaIcon name="flame" size={12} /> {activo.esPropio ? "Llevás" : "Lleva"} {adherencia.rachaDias}{" "}
            {adherencia.rachaDias === 1 ? "día" : "días"} sin saltarte ninguno
          </div>
        )}
      </Link>

      <TiraStock items={stockBajo} deQuien={activo.esPropio ? null : nombre} puedeEditar={puedeEditar} />

      {/* Próximos turnos */}
      <div>
        <div className="flex items-baseline justify-between px-0.5 pb-[11px]">
          <h2 className="font-heading text-base font-extrabold tracking-[-0.02em]">Próximos turnos</h2>
          <Link href="/app/turnos" className="text-[13px] font-bold text-teal-deep">
            Ver todos →
          </Link>
        </div>
        <TurnosHome turnos={turnosProximos} perfil={activo} puedeEditar={puedeEditar} />
      </div>
        </>
      )}

      {activo.esPropio && <NudgeVita />}
    </div>
  );
}

// "jueves": nombre del día de la semana de una fecha AR (para "alcanzan hasta el jueves").
function nombreDelDia(fechaISO: string): string {
  return new Intl.DateTimeFormat("es-AR", { weekday: "long", timeZone: "UTC" }).format(new Date(`${fechaISO}T12:00:00Z`));
}
