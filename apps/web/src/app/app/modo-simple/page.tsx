import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import * as medicamentos from "@/lib/medicamentos/nucleo";
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

  // listarHoy() ya devuelve las filas ordenadas por hora_programada
  // ascendente (ver listarTodos) — la primera pendiente es exactamente
  // "la próxima dosis" que pide el diseño, ya sea una vencida más
  // temprano en el día o la próxima por venir.
  const hoy = await medicamentos.listarHoy(supabase, usuario.id);
  const pendiente = hoy.find((m) => !m.tomado) ?? null;

  if (!pendiente) {
    return <Pantalla key="descanso" proxima={null} vencida={false} faltanMinutos={0} />;
  }

  const ahoraHHMM = medicamentos.horaEnAR();
  const vencida = medicamentos.esDosisVencida(pendiente.hora_programada, ahoraHHMM, GRACIA_MIN);
  const faltanMinutos = Math.max(0, minutosHasta(pendiente.hora_programada, ahoraHHMM));

  return (
    <Pantalla
      // key por id: al confirmar, la próxima dosis pendiente cambia (u
      // desaparece) y esto fuerza un remount limpio del estado de la
      // pantalla (fase, audio desbloqueado) en vez de arrastrar el estado
      // de la dosis anterior.
      key={pendiente.id}
      proxima={{
        id: pendiente.id,
        nombre: pendiente.nombre,
        dosis: pendiente.dosis,
        unidad: pendiente.unidad,
        horaProgramada: pendiente.hora_programada,
      }}
      vencida={vencida}
      faltanMinutos={faltanMinutos}
    />
  );
}
