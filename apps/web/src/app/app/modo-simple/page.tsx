import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import * as medicamentos from "@/lib/medicamentos/nucleo";
import { obtenerPerfilCacheado } from "@/lib/perfil/cacheado";
import { momentoDelDia } from "@/lib/rutina/momento";
import { fechaLargaEnAR, saludoEnAR } from "@/lib/rutina/formato";
import { listarRecordatoriosPendientes } from "@/lib/notificaciones/recordatorios";
import { obtenerPrefs } from "@/lib/modo-simple/nucleo";
import { medicionesParaMostrar, proximoGrupoPendiente, proximoTurnoParaCharla, turnoParaMostrar } from "@/lib/modo-simple/datos";
import type { PrefsModoSimple } from "@/lib/modo-simple/tipos";
import { Pantalla } from "./pantalla";

// Mismo margen de gracia que va a usar el cron de dosis vencidas (PR5,
// `detectarDosisVencidas(admin, ahora, graciaMin=30)` en el diseño) — acá
// solo decide qué fase muestra esta pantalla ("alertado"), nunca dispara
// ningún email: ese camino es enteramente server-side y asíncrono (cron +
// Resend), desacoplado de si esta pantalla está abierta o no. Si PR5 llega
// a exportar esta constante desde un módulo compartido, conviene tomarla
// de ahí en vez de repetirla acá.
const GRACIA_MIN = 30;

/**
 * Lo accesorio (perfil, turno, mediciones, recordatorios) nunca tumba la
 * pantalla: si falla, esa parte no se muestra y las pastillas siguen. Solo las
 * tomas de hoy son esenciales (sin ellas no hay qué mostrar y va al error).
 */
async function opcional<T>(promesa: Promise<T>, respaldo: T, que: string): Promise<T> {
  try {
    return await promesa;
  } catch (e) {
    console.error(`[modo-simple] no se pudo leer ${que}`, e);
    return respaldo;
  }
}

export default async function ModoSimplePage() {
  const usuario = await requireUser();
  const supabase = await createClient();

  const [hoy, perfil, config] = await Promise.all([
    medicamentos.listarHoy(supabase, usuario.id),
    opcional(obtenerPerfilCacheado(usuario.id), null, "el perfil"),
    obtenerPrefs(supabase, usuario.id),
  ]);
  const ahoraHHMM = medicamentos.horaEnAR();
  const [turno, mediciones, turnoProximo] = await Promise.all([
    config.ver_turnos ? opcional(turnoParaMostrar(supabase, usuario.id), null, "el turno") : null,
    config.ver_mediciones ? opcional(medicionesParaMostrar(supabase, usuario.id), null, "las mediciones") : null,
    // Solo para la respuesta hablada de la charla: sin "ver turnos" no se menciona ninguno.
    config.ver_turnos ? opcional(proximoTurnoParaCharla(supabase, usuario.id, ahoraHHMM), null, "el próximo turno") : null,
  ]);
  const pendienteHoy = proximoGrupoPendiente(hoy, ahoraHHMM);
  // Medianoche (00:00-00:30 AR): la dosis de AYER sin tomar va primero, como "Era ayer" en el
  // resto de la app; se marca con la fecha de ayer. Fuera de la ventana no consulta nada.
  const deAyer = [...(await medicamentos.listarVencidasDeAyer(supabase, usuario.id))].sort((a, b) =>
    a.hora_programada.localeCompare(b.hora_programada)
  );
  const fechaDosis = deAyer.length > 0 ? medicamentos.fechaAyerEnAR() : null;
  const { resto, invalidas } = pendienteHoy;
  const enGrupo = deAyer.length > 0 ? deAyer : pendienteHoy.enGrupo;
  const primera = deAyer.length > 0 ? deAyer[0] : pendienteHoy.primera;
  const momento = deAyer.length > 0 ? momentoDelDia(deAyer[0].hora_programada) : pendienteHoy.momento;

  const cabecera = {
    usuarioId: usuario.id,
    nombre: perfil?.nombre?.trim() || "",
    saludo: saludoEnAR(),
    fechaTexto: fechaLargaEnAR(),
    // Ayuda llama a quien eligió quien configuró el modo simple; si no, al
    // contacto de emergencia del perfil.
    telefonoAyuda: config.llamar_telefono ?? (perfil?.contacto_emergencia_telefono?.trim() || null),
    nombreAyuda: config.llamar_telefono ? config.llamar_nombre : perfil?.contacto_emergencia_nombre?.trim() || null,
    config: config satisfies PrefsModoSimple,
    turno,
    mediciones,
    turnoProximo,
    medsHoy: hoy.map((m) => ({ nombre: m.nombre, hora_programada: m.hora_programada, tomado: m.tomado })),
  };

  const vencida = deAyer.length > 0 || (primera ? medicamentos.esDosisVencida(primera.hora_programada, ahoraHHMM, GRACIA_MIN) : false);
  // Los recordatorios del familiar son de las dosis de hoy: con una de ayer en pantalla no se muestran.
  const recordatorios =
    !fechaDosis && enGrupo.length ? await opcional(listarRecordatoriosPendientes(supabase, usuario.id, pendienteHoy.enGrupo), [], "los recordatorios") : [];

  return (
    <Pantalla
      // key por ids del grupo: al confirmar, el grupo pendiente cambia (u
      // desaparece) y esto fuerza un remount limpio del estado de la
      // pantalla (fase, audio desbloqueado) en vez de arrastrar el estado
      // del grupo anterior.
      key={(fechaDosis ? "ayer:" : "") + (enGrupo.map((m) => m.id).join(",") || "descanso")}
      fechaDosis={fechaDosis}
      {...cabecera}
      grupo={enGrupo.map((m) => ({
        id: m.id,
        nombre: m.nombre,
        dosis: m.dosis,
        unidad: m.unidad,
        horaProgramada: m.hora_programada,
      }))}
      momento={momento}
      siguientes={resto.slice(0, 3).map((m) => ({
        id: m.id,
        nombre: m.nombre,
        horaProgramada: m.hora_programada,
        momento: momentoDelDia(m.hora_programada),
      }))}
      porCorregir={invalidas.map((m) => ({ id: m.id, nombre: m.nombre }))}
      hayMedsHoy={hoy.length > 0}
      vencida={vencida}
      recordatorios={recordatorios}
    />
  );
}
