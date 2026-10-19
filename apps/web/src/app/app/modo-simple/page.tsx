import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import * as medicamentos from "@/lib/medicamentos/nucleo";
import * as perfilNucleo from "@/lib/perfil/nucleo";
import { momentoDelDia } from "@/lib/rutina/momento";
import { fechaLargaEnAR, saludoEnAR } from "@/lib/rutina/formato";
import { listarRecordatoriosPendientes } from "@/lib/notificaciones/recordatorios";
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
 * Diferencia en minutos entre `horaProgramada` y `ahoraHHMM` (ambas
 * "HH:MM", hora AR) — solo para el texto "en X minutos" de la fase
 * esperando. A diferencia de `esDosisVencida` (que decide si ya se
 * considera vencida contra un margen de gracia), esto es puro texto de
 * presentación: no se reutiliza en ninguna decisión de negocio.
 */
function minutosHasta(horaProgramada: string, ahoraHHMM: string): number {
  const aMinutos = (hhmm: string) => {
    const [horas, minutos] = hhmm.split(":").map(Number);
    return horas * 60 + minutos;
  };
  return aMinutos(horaProgramada) - aMinutos(ahoraHHMM);
}

export default async function ModoSimplePage() {
  const usuario = await requireUser();
  const supabase = await createClient();

  const [hoy, perfil] = await Promise.all([
    // listarHoy() ya devuelve las filas ordenadas por hora_programada
    // ascendente (ver listarTodos) — la primera pendiente es exactamente
    // "la próxima dosis" que pide el diseño, ya sea una vencida más
    // temprano en el día o la próxima por venir.
    medicamentos.listarHoy(supabase, usuario.id),
    perfilNucleo.obtenerPerfil(supabase, usuario.id),
  ]);
  const pendientes = hoy.filter((m) => !m.tomado);

  const cabecera = {
    nombre: perfil?.nombre?.trim() || "",
    saludo: saludoEnAR(),
    fechaTexto: fechaLargaEnAR(),
    telefonoEmergencia: perfil?.contacto_emergencia_telefono?.trim() || null,
    nombreEmergencia: perfil?.contacto_emergencia_nombre?.trim() || null,
  };

  if (pendientes.length === 0) {
    return <Pantalla key="descanso" {...cabecera} grupo={[]} momento={null} siguientes={[]} hayMedsHoy={hoy.length > 0} vencida={false} faltanMinutos={0} recordatorios={[]} />;
  }

  // V7: una tarjeta por momento del día. El grupo son todas las pendientes
  // del mismo momento que la próxima dosis pendiente ("Tus 2 pastillas de la
  // mañana"); lo que queda para otros momentos va a "Después".
  const primera = pendientes[0];
  const momento = momentoDelDia(primera.hora_programada);
  const enGrupo = pendientes.filter((m) => momentoDelDia(m.hora_programada) === momento);
  const resto = pendientes.filter((m) => momentoDelDia(m.hora_programada) !== momento);

  const ahoraHHMM = medicamentos.horaEnAR();
  const vencida = medicamentos.esDosisVencida(primera.hora_programada, ahoraHHMM, GRACIA_MIN);
  const faltanMinutos = Math.max(0, minutosHasta(primera.hora_programada, ahoraHHMM));
  const recordatorios = await listarRecordatoriosPendientes(supabase, usuario.id, enGrupo);

  return (
    <Pantalla
      // key por ids del grupo: al confirmar, el grupo pendiente cambia (u
      // desaparece) y esto fuerza un remount limpio del estado de la
      // pantalla (fase, audio desbloqueado) en vez de arrastrar el estado
      // del grupo anterior.
      key={enGrupo.map((m) => m.id).join(",")}
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
      hayMedsHoy
      vencida={vencida}
      faltanMinutos={faltanMinutos}
      recordatorios={recordatorios}
    />
  );
}
