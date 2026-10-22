// PIN de bloqueo de vita — SOLO de este dispositivo (V7 Seguridad › "PIN al
// volver"). No es un control de cuenta: vive en localStorage del navegador,
// atado al id del usuario, y bloquea la pantalla de la app al volver a
// abrirla. Se guarda sal + hash PBKDF2-SHA256 (nunca el PIN). Quien tenga
// acceso al navegador puede borrar localStorage: protege contra alguien que
// agarra el celular desbloqueado y abre vita, no contra un atacante con
// control del dispositivo. Sin `crypto.subtle` (contexto no seguro) el PIN no
// está disponible y la UI lo dice.

export type EsperaPin = 0 | 5 | 10 | 30;
export const ESPERAS_PIN: { valor: EsperaPin; etiqueta: string }[] = [
  { valor: 0, etiqueta: "Al instante" },
  { valor: 5, etiqueta: "5 min" },
  { valor: 10, etiqueta: "10 min" },
  { valor: 30, etiqueta: "30 min" },
];

export const LARGO_PIN = 4;
export const INTENTOS_MAXIMOS = 5;
const ITERACIONES = 120_000;

const clave = (uid: string, que: "hash" | "espera" | "visto") => `vita_pin:${uid}:${que}`;

type PinGuardado = { sal: string; hash: string; it: number };

function leer(k: string): string | null {
  try {
    return window.localStorage.getItem(k);
  } catch {
    return null;
  }
}
function escribir(k: string, v: string | null) {
  try {
    if (v === null) window.localStorage.removeItem(k);
    else window.localStorage.setItem(k, v);
  } catch {
    /* almacenamiento bloqueado: el PIN queda sin activar */
  }
}

// --- Suscripción mínima para que los componentes reaccionen a cambios ------
const oyentes = new Set<() => void>();
let version = 0;
export function suscribirPin(cb: () => void) {
  oyentes.add(cb);
  return () => {
    oyentes.delete(cb);
  };
}
export function versionPin() {
  return version;
}
function avisar() {
  version++;
  oyentes.forEach((cb) => cb());
}

export function pinDisponible(): boolean {
  return typeof window !== "undefined" && !!window.crypto?.subtle;
}

export function pinConfigurado(uid: string): boolean {
  if (typeof window === "undefined") return false;
  return leer(clave(uid, "hash")) !== null;
}

export function leerEspera(uid: string): EsperaPin {
  const n = Number(leer(clave(uid, "espera")));
  return n === 5 || n === 10 || n === 30 ? n : 0;
}
export function guardarEspera(uid: string, espera: EsperaPin) {
  escribir(clave(uid, "espera"), String(espera));
  avisar();
}

/** Marca "última vez que vi la app abierta" (al ocultarse / desbloquear). */
export function marcarVisto(uid: string) {
  escribir(clave(uid, "visto"), String(new Date().getTime()));
}

/** ¿Pasó la espera elegida desde la última vez que la app estuvo a la vista? */
export function corresponderBloquear(uid: string): boolean {
  if (!pinConfigurado(uid)) return false;
  const visto = Number(leer(clave(uid, "visto")));
  if (!visto) return true;
  return new Date().getTime() - visto >= leerEspera(uid) * 60_000;
}

function aBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s);
}
function desdeBase64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function derivar(pin: string, sal: Uint8Array<ArrayBuffer>, it: number): Promise<string> {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: sal, iterations: it }, base, 256);
  return aBase64(bits);
}

export async function guardarPin(uid: string, pin: string): Promise<boolean> {
  if (!pinDisponible() || !new RegExp(`^\\d{${LARGO_PIN}}$`).test(pin)) return false;
  const sal = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)));
  const hash = await derivar(pin, sal, ITERACIONES);
  const guardado: PinGuardado = { sal: aBase64(sal), hash, it: ITERACIONES };
  escribir(clave(uid, "hash"), JSON.stringify(guardado));
  if (leer(clave(uid, "hash")) === null) return false; // localStorage bloqueado
  marcarVisto(uid);
  fijarBloqueada(false);
  avisar();
  return true;
}

export async function verificarPin(uid: string, pin: string): Promise<boolean> {
  const crudo = leer(clave(uid, "hash"));
  if (!crudo || !pinDisponible()) return false;
  try {
    const g = JSON.parse(crudo) as PinGuardado;
    const hash = await derivar(pin, desdeBase64(g.sal), g.it);
    return hash === g.hash;
  } catch {
    return false;
  }
}

export function quitarPin(uid: string) {
  escribir(clave(uid, "hash"), null);
  escribir(clave(uid, "visto"), null);
  fijarBloqueada(false);
  avisar();
}

// --- Estado global "bloqueada" (lo lee el overlay del layout) -------------
let bloqueada: boolean | null = null;
const oyentesBloqueo = new Set<() => void>();
export function suscribirBloqueo(cb: () => void) {
  oyentesBloqueo.add(cb);
  return () => {
    oyentesBloqueo.delete(cb);
  };
}
export function leerBloqueada(uid: string): boolean {
  if (bloqueada === null) bloqueada = corresponderBloquear(uid);
  return bloqueada;
}
export function fijarBloqueada(valor: boolean) {
  bloqueada = valor;
  oyentesBloqueo.forEach((cb) => cb());
}
