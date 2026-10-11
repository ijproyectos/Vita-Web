import "server-only";

// Freno liviano anti-abuso: máximo N envíos por clave (id de vínculo) dentro
// de una ventana. Vive en memoria de la instancia — en serverless NO es un
// límite global ni persiste entre cold starts; es una red de seguridad barata
// (el código vence en 30 min y la invitación es por vínculo), no rate-limiting
// real. Límite conocido, igual criterio que la migración 010.
const MAX_ENVIOS = 5;
const VENTANA_MS = 60 * 60 * 1000;
const envios = new Map<string, number[]>();

export function permitirEnvio(clave: string): boolean {
  const ahora = new Date().getTime();
  const recientes = (envios.get(clave) ?? []).filter((t) => ahora - t < VENTANA_MS);
  if (recientes.length >= MAX_ENVIOS) {
    envios.set(clave, recientes);
    return false;
  }
  recientes.push(ahora);
  envios.set(clave, recientes);
  return true;
}
