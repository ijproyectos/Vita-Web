import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import * as medicamentos from "@/lib/medicamentos/nucleo";
import * as perfilNucleo from "@/lib/perfil/nucleo";
import { momentoDelDia } from "@/lib/rutina/momento";
import { fechaLargaEnAR, saludoEnAR } from "@/lib/rutina/formato";
import { listarRecordatoriosPendientes } from "@/lib/notificaciones/recordatorios";
import { obtenerPrefs } from "@/lib/modo-simple/nucleo";
import { medicionesParaMostrar, proximoGrupoPendiente, turnoParaMostrar } from "@/lib/modo-simple/datos";
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

export default async function ModoSimplePage() {
  const usuario = await requireUser();
  const supabase = await createClient();

  const [hoy, perfil, config] = await Promise.all([
    medicamentos.listarHoy(supabase, usuario.id),
    perfilNucleo.obtenerPerfil(supabase, usuario.id),
    obtenerPrefs(supabase, usuario.id),
  ]);
  const [turno, mediciones] = await Promise.all([
    config.ver_turnos ? turnoParaMostrar(supabase, usuario.id) : null,
    config.ver_mediciones ? medicionesParaMostrar(supabase, usuario.id) : null,
  ]);
  const ahoraHHMM = medicamentos.horaEnAR();
  const { primera, momento, enGrupo, resto, invalidas } = proximoGrupoPendiente(hoy, ahoraHHMM);

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
  };

  const vencida = primera ? medicamentos.esDosisVencida(primera.hora_programada, ahoraHHMM, GRACIA_MIN) : false;
  const recordatorios = enGrupo.length ? await listarRecordatoriosPendientes(supabase, usuario.id, enGrupo) : [];

  return (
    <Pantalla
      // key por ids del grupo: al confirmar, el grupo pendiente cambia (u
      // desaparece) y esto fuerza un remount limpio del estado de la
      // pantalla (fase, audio desbloqueado) en vez de arrastrar el estado
      // del grupo anterior.
      key={enGrupo.map((m) => m.id).join(",") || "descanso"}
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
