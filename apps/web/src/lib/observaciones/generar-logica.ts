// Lógica PURA del generador de observaciones: qué insertar o vencer, a quién avisar por push y con qué texto.
// Sin `server-only` ni base de datos: la usa `generar.ts` y la prueban los tests.

import { enSilencioNocturno, type PreferenciasAvisos } from "@/lib/notificaciones/avisos-tipos";
import type { PayloadPush } from "@/lib/notificaciones/push";
import { RETENCION_DIAS_TRAS_VIGENCIA, TIPOS_CON_PUSH } from "./constantes";
import { textoSeguro } from "./reglas";
import type { ObservacionNueva, TipoObservacion } from "./tipos";

/**
 * Personas por lote. Cada lote hace ~9 lecturas en paralelo (una por tabla) y 1-2 escrituras, estimadas en ~1 s en
 * total (conservador). Con el presupuesto de 8 s, la reserva de 2,5 s para push y la guarda de 2,5 s antes de otro lote,
 * entran ~2-3 lotes por tick: ~50-75 personas por tick y ~600-900 por ventana de 12 ticks (08:00-10:59 AR). Es el TECHO
 * de este diseño: pasado eso hay que ensanchar la ventana del cron o subir `maxDuration` junto con el timeout de Netlify.
 * Las lecturas paginan de a 1000 filas, así que un lote grande no pierde datos (solo tarda más).
 */
export const TAMANO_LOTE = 25;
/** Presupuesto interno del cron (la función síncrona de Netlify corta a ~10 s). */
export const PRESUPUESTO_CRON_MS = 8_000;
/** Tiempo que se reserva al final de cada tick para los push. */
export const RESERVA_PUSH_MS = 2_500;
/** Mínimo para arrancar otro lote. */
export const MINIMO_PARA_OTRO_LOTE_MS = 2_500;

/** Cursor inicial y final (ordenados como uuid: de menor a mayor). */
export const CURSOR_INICIAL = "00000000-0000-0000-0000-000000000000";
export const CURSOR_FIN = "ffffffff-ffff-ffff-ffff-ffffffffffff";
/** Tipo de la fila de `envios_avisos` donde se guarda el cursor del día. */
export const TIPO_ENVIO_CURSOR = "observaciones_lote";
/** Tipo de la fila de `envios_avisos` que limita a 1 push por persona y por día. */
export const TIPO_ENVIO_PUSH = "observacion_push";

type ExistenteObs = { id: string; clave: string };

/**
 * Qué hacer con las observaciones vigentes de una persona frente a lo que dicen las reglas hoy:
 * se guardan todas las actuales (alta o refresco; no se pisan vista ni descartada) y se vencen las que ya no se
 * cumplen. Así una observación se apaga sola cuando la condición deja de valer.
 */
export function planificarCambios(
  existentes: ExistenteObs[],
  nuevas: ObservacionNueva[]
): { aGuardar: ObservacionNueva[]; aVencer: string[] } {
  const claves = new Set(nuevas.map((n) => n.clave));
  return { aGuardar: nuevas, aVencer: existentes.filter((e) => !claves.has(e.clave)).map((e) => e.id) };
}

/** Instante (ISO) antes del cual se borran las observaciones vencidas. */
export function corteDeRetencion(ahoraMs: number): string {
  return new Date(ahoraMs - RETENCION_DIAS_TRAS_VIGENCIA * 86_400_000).toISOString();
}

export type CandidataPush = {
  id: string;
  usuario_id: string;
  tipo: TipoObservacion;
  titulo: string;
  texto: string;
  href: string | null;
};

/** La de más prioridad entre las candidatas de una persona (orden de `TIPOS_CON_PUSH`); null si ninguna aplica. */
export function elegirParaPush<T extends { tipo: string }>(candidatas: T[]): T | null {
  let mejor: T | null = null;
  let mejorIndice = Infinity;
  for (const c of candidatas) {
    const i = (TIPOS_CON_PUSH as readonly string[]).indexOf(c.tipo);
    if (i !== -1 && i < mejorIndice) {
      mejor = c;
      mejorIndice = i;
    }
  }
  return mejor;
}

export type DestinoPush = { usuarioId: string; esPersona: boolean };

/**
 * A quién le llega el push de una observación: la persona misma (salvo en `familia_sin_tomas`, que es un aviso para
 * quien cuida) y sus cuidadores con rol Admin. Respeta el interruptor "Observaciones de vita" y el silencio nocturno
 * de cada destinatario. Sin duplicados.
 */
export function destinosDePush(args: {
  tipo: string;
  personaId: string;
  cuidadoresEditores: string[];
  prefsDe: (usuarioId: string) => PreferenciasAvisos;
  horaAR: string;
}): DestinoPush[] {
  const lista: DestinoPush[] = [];
  if (args.tipo !== "familia_sin_tomas") lista.push({ usuarioId: args.personaId, esPersona: true });
  for (const id of args.cuidadoresEditores) if (id !== args.personaId) lista.push({ usuarioId: id, esPersona: false });
  const vistos = new Set<string>();
  return lista.filter((d) => {
    if (vistos.has(d.usuarioId)) return false;
    vistos.add(d.usuarioId);
    const prefs = args.prefsDe(d.usuarioId);
    return prefs.observaciones && !enSilencioNocturno(prefs, args.horaAR);
  });
}

function acortar(texto: string, max: number): string {
  return texto.length <= max ? texto : `${texto.slice(0, max - 1).trimEnd()}…`;
}

/** Texto del aviso (feed + push) de una observación, para la persona o para quien la cuida. */
export function textosDeAviso(
  obs: Pick<CandidataPush, "titulo" | "texto">,
  esPersona: boolean,
  nombrePersona: string
): { titulo: string; cuerpo: string } {
  if (esPersona) return { titulo: obs.titulo, cuerpo: acortar(obs.texto, 160) };
  const primero = textoSeguro(nombrePersona).split(" ")[0] || "tu familiar";
  return { titulo: acortar(`vita notó algo en los datos de ${primero}`, 80), cuerpo: acortar(obs.titulo, 160) };
}

export function payloadObservacion(args: { titulo: string; cuerpo: string; personaId: string; href: string | null }): PayloadPush {
  return {
    title: args.titulo,
    body: args.cuerpo,
    url: args.href && args.href.startsWith("/app") ? args.href : "/app/observaciones",
    tag: `observacion-${args.personaId}`,
  };
}

/**
 * Procesa `items` de una vez; si el lote falla, reintenta persona por persona y OMITE solo a la que falla (avisando
 * con `alOmitir`), así una fila rara no frena al resto del día. El procesamiento tiene que ser idempotente (acá lo es:
 * upsert por clave). Nunca lanza por un item.
 */
export async function procesarTolerante<T>(
  items: T[],
  procesar: (lote: T[]) => Promise<void>,
  alOmitir: (item: T, error: unknown) => void
): Promise<{ omitidos: number }> {
  try {
    await procesar(items);
    return { omitidos: 0 };
  } catch (errorLote) {
    if (items.length <= 1) {
      for (const it of items) alOmitir(it, errorLote);
      return { omitidos: items.length };
    }
  }
  let omitidos = 0;
  for (const it of items) {
    try {
      await procesar([it]);
    } catch (e) {
      omitidos++;
      alOmitir(it, e);
    }
  }
  return { omitidos };
}
