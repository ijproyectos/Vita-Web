import { z } from "zod";
import { MAX_METRICAS_POR_ENVIO, METRICAS_VITALS, NAVEGACIONES_VITALS, RATINGS_VITALS, type MetricaVital } from "./constantes";

export * from "./constantes";

// Parte PURA de la medicion de velocidad real (Web Vitals). Sin server-only ni I/O: la usan el
// cliente (que arma el envio), la route (que valida) y los tests. Nunca viaja ni se guarda nada
// personal: ni usuario, ni IP, ni user agent; solo la ruta SIN ids, la metrica y una clase de
// dispositivo gruesa (mobile / desktop).

export const esquemaEnvioVitals = z.object({
  ruta: z.string().min(1).max(300),
  metricas: z
    .array(
      z.object({
        nombre: z.enum(METRICAS_VITALS),
        valor: z.number().finite().min(0).max(600_000),
        rating: z.enum(RATINGS_VITALS),
        navegacion: z.string().max(30).optional(),
      })
    )
    .min(1)
    .max(MAX_METRICAS_POR_ENVIO),
});
export type EnvioVitals = z.infer<typeof esquemaEnvioVitals>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Rutas con segmento dinamico conocido: se normaliza por posicion, no por forma del valor.
const PATRONES_DINAMICOS: { base: string; marca: string }[] = [
  { base: "/app/familia", marca: "[id]" },
  { base: "/cuidar/invitacion", marca: "[token]" },
  { base: "/cuidar", marca: "[elderId]" },
  { base: "/p", marca: "[token]" },
  { base: "/app/mi-salud/estudios", marca: "[id]" },
  { base: "/app/mi-salud/monitoreo", marca: "[tipo]" },
];

// Segmentos estaticos conocidos que cuelgan de las bases dinamicas: no se reemplazan.
const ESTATICOS_BAJO_BASE: Record<string, string[]> = {
  "/app/familia": ["nuevo", "invitar"],
  "/cuidar": ["invitacion"],
  "/app/mi-salud/monitoreo": ["agregar"],
};

function pareceIdentificador(segmento: string): boolean {
  if (UUID.test(segmento)) return true;
  if (/^\d{4,}$/.test(segmento)) return true;
  if (/^[0-9a-f]{16,}$/i.test(segmento)) return true;
  // token largo en base64url
  return segmento.length >= 20 && /^[A-Za-z0-9_-]+$/.test(segmento) && /\d/.test(segmento);
}

/**
 * Ruta sin ids, sin query y sin hash, con los segmentos dinamicos como `[id]`. Es la clave de
 * agrupacion de las mediciones: nunca debe contener nada que identifique a una persona.
 */
export function normalizarRuta(crudo: string): string {
  let ruta = crudo.trim().split("#")[0].split("?")[0];
  if (!ruta.startsWith("/")) return "/otra";
  try {
    ruta = decodeURI(ruta);
  } catch {
    return "/otra";
  }
  const segmentos = ruta.split("/").filter(Boolean);
  const salida: string[] = [];
  let base = "";
  let marcado = false;
  for (const seg of segmentos) {
    const clave = `${base}`;
    const estaticos = ESTATICOS_BAJO_BASE[clave] ?? [];
    const patron = PATRONES_DINAMICOS.find((p) => p.base === clave);
    if (!marcado && patron && !estaticos.includes(seg)) {
      salida.push(patron.marca);
      marcado = true;
      base = `${base}/${patron.marca}`;
      continue;
    }
    salida.push(pareceIdentificador(seg) ? "[id]" : seg);
    base = `${base}/${seg}`;
  }
  const limpia = `/${salida.join("/")}`.replace(/[^a-zA-Z0-9/_\-[\]]/g, "").slice(0, 120);
  return limpia.length > 1 ? limpia : "/";
}

/** Clase de dispositivo gruesa a partir del user agent (que NO se guarda). */
export function clasificarDispositivo(userAgent: string | null | undefined): "mobile" | "desktop" {
  return /Mobi|Android|iPhone|iPad|iPod/i.test(userAgent ?? "") ? "mobile" : "desktop";
}

export type FilaVital = {
  ruta: string;
  metrica: MetricaVital;
  valor: number;
  rating: (typeof RATINGS_VITALS)[number];
  tipo_navegacion: (typeof NAVEGACIONES_VITALS)[number] | null;
  dispositivo: "mobile" | "desktop";
};

/** Filas listas para insertar a partir de un envio ya validado; la ruta se vuelve a normalizar aca (el cliente no es de fiar). */
export function filasDeEnvio(envio: EnvioVitals, dispositivo: "mobile" | "desktop"): FilaVital[] {
  const ruta = normalizarRuta(envio.ruta);
  return envio.metricas.map((m) => ({
    ruta,
    metrica: m.nombre,
    valor: m.valor,
    rating: m.rating,
    tipo_navegacion: (NAVEGACIONES_VITALS as readonly string[]).includes(m.navegacion ?? "")
      ? (m.navegacion as FilaVital["tipo_navegacion"])
      : null,
    dispositivo,
  }));
}
