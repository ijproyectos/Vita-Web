// Link corto para compartir un código: abre DIRECTO la pantalla de ingreso de código, con el código ya escrito.
// Sin "server-only": lo usan pantallas cliente (WhatsApp / copiar), el mail y la ruta pública /c/[codigo].

import { MINUTOS_VIGENCIA_CODIGO_ACCESO } from "./tipos";

/** Los dos tipos de código (vínculo y acceso) son de 6 dígitos. */
const CODIGO_RE = /^\d{6}$/;

/**
 * Devuelve el código de 6 dígitos si `crudo` lo es (se toleran espacios o guiones de copiado, "482 916" / "482-916"),
 * o null. Nunca se prellena nada que no pase por acá.
 */
export function normalizarCodigoEnlace(crudo: unknown): string | null {
  if (typeof crudo !== "string") return null;
  const limpio = crudo.trim().replace(/[\s-]/g, "");
  return CODIGO_RE.test(limpio) ? limpio : null;
}

/** Ruta pública del link corto. */
export function rutaCodigo(codigo: string): string {
  return `/c/${codigo}`;
}

/** URL absoluta del link para un código. Sin un código válido cae en /login (nunca arma un link roto). */
export function urlCodigo(origen: string, codigo: string): string {
  const base = origen.replace(/\/+$/, "");
  const valido = normalizarCodigoEnlace(codigo);
  return valido ? `${base}${rutaCodigo(valido)}` : `${base}/login`;
}

/** Link de una invitación de cuidador: el corto si tiene código; si no (sin la migración 054), el largo. */
export function urlDeInvitacion(origen: string, inv: { token: string; codigo?: string | null }): string {
  return inv.codigo ? urlCodigo(origen, inv.codigo) : `${origen.replace(/\/+$/, "")}/cuidar/invitacion/${inv.token}`;
}

/** WhatsApp de una invitación de cuidador: link + código de respaldo + con qué mail entrar. */
export function mensajeInvitacionCuidador(args: { persona: string | null; url: string; codigo?: string | null; email: string }): string {
  const respaldo = args.codigo ? ` Tocá el link o entrá con el código ${args.codigo}.` : " Tocá el link.";
  const quien = args.persona ? `a cuidar a ${args.persona}` : "a cuidarme";
  return `Te invité ${quien} en vita.${respaldo} Usá tu mail ${args.email}. ${args.url}`;
}

/** WhatsApp / copiar del código de acceso ("Que use su celular", charla de onboarding). */
export function mensajeCodigoAcceso(args: { codigo: string; origen: string; minutos?: number }): string {
  const minutos = args.minutos ?? MINUTOS_VIGENCIA_CODIGO_ACCESO;
  return `Tu código para entrar a vita: ${args.codigo}. Tocá este link y entrás directo, con el código ya escrito: ${urlCodigo(args.origen, args.codigo)}. Vence en ${minutos} minutos y sirve una sola vez.`;
}

/** WhatsApp del código de vínculo que genera quien cuida (/onboarding/vincular-cuidado). */
export function mensajeInvitacionVinculo(args: { codigo: string; origen: string }): string {
  return `Te invito a usar vita para ayudarme con tu salud. Tu código es ${args.codigo}. Tocá este link y entrás directo, con el código ya escrito: ${urlCodigo(args.origen, args.codigo)}`;
}
