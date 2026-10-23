import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import * as perfilNucleo from "@/lib/perfil/nucleo";
import * as medicamentos from "@/lib/medicamentos/nucleo";
import { edadTexto } from "@/lib/perfil/formato";
import { nombreCompleto } from "@/lib/perfil/tipos";
import { VitaWordmark } from "@/components/vita/v-mark";
import { obtenerUsoHoy } from "@/lib/uso-ia/nucleo";
import { BarraUso, textoRestante } from "@/components/uso-ia/barra-uso";
import { esEmailDeCuentaPorCodigo } from "@/lib/acceso-codigo/tipos";
import { ActivarNotificaciones } from "@/components/vita/activar-notificaciones";
import { EncabezadoPerfil } from "@/components/vita/encabezado-perfil";
import { TarjetaVitaPlus } from "@/components/vita/tarjeta-vita-plus";
import { obtenerOpcionesPerfil, obtenerPerfilActivo } from "@/lib/familia/perfil-activo";
import { listarMisCuidadores } from "@/lib/familia/nucleo";
import { CerrarSesion } from "./cerrar-sesion";
import { FilaNav, Grupo, Tile } from "./filas";

// Perfil (V7): encabezado con selector, tarjeta de la persona, vita+ y tres
// grupos (Mi salud / Preferencias / Cuenta). Lo propio de la app que el diseño
// no tiene (modo simple, avisos, cuidadores por mail, uso de vita) cuelga al
// final del grupo que corresponde.
export default async function PerfilPage() {
  const usuario = await requireUser();
  const supabase = await createClient();

  // Con familia, el selector cambia de quién se ve la tarjeta y los números de
  // "Mi salud"; los ajustes de cuenta (avisos, sesión, uso de vita) son siempre
  // de la cuenta logueada.
  const [activo, opciones] = await Promise.all([obtenerPerfilActivo(), obtenerOpcionesPerfil()]);
  const [perfil, uso, todos, estudios, cuidadores] = await Promise.all([
    perfilNucleo.obtenerPerfil(supabase, activo.id),
    obtenerUsoHoy(usuario.id),
    medicamentos.listarTodos(supabase, activo.id).catch(() => []),
    supabase.from("estudios").select("id", { count: "exact", head: true }).eq("usuario_id", activo.id),
    listarMisCuidadores(supabase).catch(() => []),
  ]);

  const nombre = perfil ? nombreCompleto(perfil) || activo.nombre : activo.nombre;
  const condiciones = perfil?.condiciones.length ?? 0;
  const alergias = perfil?.alergias.length ?? 0;
  // Una fila por horario: se cuenta por nombre para no duplicar un mismo
  // medicamento tomado varias veces al día.
  const medsActivos = new Set(todos.map((m) => m.nombre.trim().toLowerCase())).size;
  const nEstudios = estudios.count ?? 0;
  const meta =
    (perfil
      ? [
          edadTexto(perfil),
          perfil.genero,
          perfil.altura_cm && `${perfil.altura_cm} cm`,
          perfil.peso_kg && `${perfil.peso_kg} kg`,
          perfil.grupo_sanguineo && `Grupo ${perfil.grupo_sanguineo}`,
          perfil.obra_social,
        ].filter(Boolean).join(" · ")
      : "") || "Completá tus datos";
  const aCargo = opciones.filter((o) => !o.esPropio).length;
  const resumenFamilia = [
    aCargo > 0 ? `${aCargo} a tu cargo` : null,
    `${cuidadores.length} ${cuidadores.length === 1 ? "cuidador" : "cuidadores"}`,
  ]
    .filter(Boolean)
    .join(" · ");
  const emergenciaNombre = perfil?.contacto_emergencia_nombre?.trim();
  const emergenciaRelacion = perfil?.contacto_emergencia_relacion?.trim();
  const subEmergencia = emergenciaNombre
    ? emergenciaRelacion
      ? `${emergenciaNombre} — ${emergenciaRelacion.toLowerCase()}`
      : emergenciaNombre
    : "Sin cargar";
  const porCodigo = esEmailDeCuentaPorCodigo(usuario.email);

  return (
    <div className="flex flex-col gap-5 px-[18px] pt-1.5">
      <EncabezadoPerfil
        perfil={activo}
        opciones={opciones}
        eyebrowSelector="Perfil de"
        estatico={{ eyebrow: "Tu cuenta", titulo: "Perfil" }}
      />

      {/* Tarjeta de la persona */}
      <div className="flex items-center gap-3.5 rounded-[20px] bg-card p-5 shadow-card">
        <div className="flex size-[62px] shrink-0 items-center justify-center rounded-full bg-persona-1-tint font-heading text-2xl font-extrabold text-persona-1-deep">
          {nombre.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-heading text-lg font-extrabold tracking-[-0.02em]">{nombre}</div>
          <div className="mt-[3px] text-[11.5px] font-medium text-subtle">{meta}</div>
        </div>
        <Link
          href="/app/perfil/editar"
          className="shrink-0 rounded-full bg-persona-1-tint px-3 py-2 text-[12.5px] font-bold text-persona-1-deep transition-transform active:scale-[0.96] motion-reduce:transition-none"
        >
          Editar
        </Link>
      </div>

      {activo.esPropio && <TarjetaVitaPlus />}

      <Grupo titulo="Mi salud">
        <FilaNav
          icon="heart"
          tono="rose"
          label="Condiciones y alergias"
          sub={`${condiciones} ${condiciones === 1 ? "condición" : "condiciones"} · ${alergias} ${alergias === 1 ? "alergia" : "alergias"}`}
          href="/app/condiciones"
        />
        <FilaNav
          icon="pill"
          tono="teal"
          label={activo.esPropio ? "Mis medicamentos" : "Medicamentos"}
          sub={`${medsActivos} ${medsActivos === 1 ? "activo" : "activos"}`}
          href="/app/medicamentos"
        />
        <FilaNav icon="activity" tono="violet" label="Monitoreo" sub="Presión, glucemia, peso" href="/app/mi-salud/monitoreo" />
        <FilaNav
          icon="vial"
          tono="amber"
          label="Estudios"
          sub={`${nEstudios} ${nEstudios === 1 ? "estudio" : "estudios"}`}
          href="/app/mi-salud?f=estudio"
        />
      </Grupo>

      <Grupo titulo="Preferencias">
        <FilaNav icon="users" label="Familia y permisos" sub={resumenFamilia} href="/app/familia" />
        <FilaNav icon="bell" label="Recordatorios" sub="Qué avisos recibir, esperas y silencio de noche" href="/app/avisos/configuracion" />
        <FilaNav icon="phone" label="Contacto de emergencia" sub={subEmergencia} href="/app/perfil/contacto-emergencia" />
        <FilaNav icon="shield" label="Seguridad" sub="PIN al volver y tu sesión" href="/app/perfil/seguridad" />
        <FilaNav icon="lock" label="Privacidad y datos" sub="Exportar o borrar tu historial" href="/app/perfil/privacidad" />
        {/* Propio de la app (no está en el diseño): */}
        <FilaNav icon="sun" label="Modo simple" sub="Pantalla grande para confirmar tu medicación, sin menús" href="/app/modo-simple" />
        <ActivarNotificaciones variante="perfil" />
      </Grupo>

      <Grupo titulo="Cuenta">
        {uso && (
          <div className="flex flex-col gap-2 px-4 py-3.5">
            <div className="flex items-center gap-3">
              <Tile icon="sparkle" />
              <div className="min-w-0 flex-1">
                <div className="font-heading text-[14.5px] font-extrabold tracking-[-0.02em]">Uso de vita hoy</div>
                <div className="mt-0.5 text-[11.5px] font-medium leading-snug text-subtle">{textoRestante(uso)}</div>
              </div>
            </div>
            <BarraUso uso={uso} />
            <div className="text-[11.5px] font-medium text-subtle">
              {uso.usados.toLocaleString("es-AR")} de {uso.limite.toLocaleString("es-AR")} tokens usados hoy
            </div>
          </div>
        )}
        <FilaNav icon="help" label="Ayuda y soporte" sub="Preguntas frecuentes y contacto" href="/app/perfil/ayuda" />
        <CerrarSesion sub={porCodigo ? "Volvés a entrar con el código de tu familiar" : "Volvés a entrar con Google o con tu mail"} />
        <FilaNav icon="trash" tono="rose" peligro label="Eliminar mi cuenta" sub="Borra tus datos para siempre" href="/app/perfil/eliminar-cuenta" />
      </Grupo>

      <div className="flex flex-col items-center gap-2 pb-2 pt-1 text-center">
        <VitaWordmark size={26} />
        <div className="text-[11px] font-medium text-subtle">versión 1.0</div>
      </div>
    </div>
  );
}
