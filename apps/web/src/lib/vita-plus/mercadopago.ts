import { esIdSeguro, type ClaseFetchMp, clasificarFetchMp } from "./logica";

// Cliente HTTP mínimo de Mercado Pago para vita+ (app propia de vita, credenciales propias). Solo servidor.
// Nunca lanza: devuelve el status HTTP (0 = red/timeout) y el JSON si lo hay. Los cuerpos, el token y los
// emails jamás se loguean; solo el status.

export const MP_API = "https://api.mercadopago.com";
export const TIMEOUT_MP_MS = 8_000;

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface RespuestaMp {
  status: number;
  json: unknown | null;
}

export interface LecturaMp {
  clase: ClaseFetchMp;
  json: unknown | null;
}

export function urlPreapproval(id: string): string {
  return `${MP_API}/preapproval/${encodeURIComponent(id)}`;
}

export function urlPagoAutorizado(id: string): string {
  return `${MP_API}/authorized_payments/${encodeURIComponent(id)}`;
}

/** Las credenciales viven en el entorno; sin token vita+ queda deshabilitado (la pantalla sigue mostrando "Muy pronto"). */
export function vitaPlusConfigurado(): boolean {
  return Boolean(process.env.MP_ACCESS_TOKEN?.trim());
}

export function crearClienteMp(token: string, fetchImpl?: FetchLike) {
  const hacerFetch: FetchLike = fetchImpl ?? ((url, init) => fetch(url, init));

  async function pedir(url: string, init: RequestInit): Promise<RespuestaMp> {
    const controlador = new AbortController();
    const timer = setTimeout(() => controlador.abort(), TIMEOUT_MP_MS);
    try {
      const respuesta = await hacerFetch(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          ...(init.body ? { "Content-Type": "application/json" } : {}),
        },
        signal: controlador.signal,
        cache: "no-store",
      });
      if (!respuesta.ok) {
        console.error("vita+: Mercado Pago respondió con error", respuesta.status);
        return { status: respuesta.status, json: null };
      }
      const json: unknown = await respuesta.json().catch(() => null);
      return { status: respuesta.status, json };
    } catch (error) {
      console.error("vita+: fallo de red con Mercado Pago", error instanceof Error ? error.name : "desconocido");
      return { status: 0, json: null };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    crearPreapproval: (cuerpo: unknown) => pedir(`${MP_API}/preapproval`, { method: "POST", body: JSON.stringify(cuerpo) }),

    async leer(url: string): Promise<LecturaMp> {
      const r = await pedir(url, { method: "GET" });
      const clase = clasificarFetchMp(r.status);
      return { clase, json: clase === "ok" ? r.json : null };
    },

    /**
     * Cancela un preapproval. La grafía del estado ("canceled" vs "cancelled") no está verificada contra la
     * referencia oficial: se prueba una y ante un 400 se reintenta UNA vez con la otra (se recuerda cuál anduvo).
     */
    async cancelar(id: string): Promise<RespuestaMp> {
      if (!esIdSeguro(id)) return { status: 400, json: null };
      return cancelarConFallback((estado) => pedir(urlPreapproval(id), { method: "PUT", body: JSON.stringify({ status: estado }) }));
    },
  };
}

export type ClienteMp = ReturnType<typeof crearClienteMp>;

const GRAFIAS = ["canceled", "cancelled"] as const;
type Grafia = (typeof GRAFIAS)[number];
let grafiaPreferida: Grafia = GRAFIAS[0];

export function reiniciarGrafiaCancelacion(): void {
  grafiaPreferida = GRAFIAS[0];
}

export async function cancelarConFallback(enviar: (estado: Grafia) => Promise<RespuestaMp>): Promise<RespuestaMp> {
  const primera = grafiaPreferida;
  const resultado = await enviar(primera);
  if (resultado.status !== 400) return resultado;
  const segunda: Grafia = primera === "canceled" ? "cancelled" : "canceled";
  const reintento = await enviar(segunda);
  if (reintento.status >= 200 && reintento.status < 300) grafiaPreferida = segunda;
  return reintento;
}

/** Lee solo `init_point` e `id` de la respuesta de creación; el resto se descarta. */
export function leerCreacion(json: unknown): { id: string; initPoint: string | null } | null {
  if (typeof json !== "object" || json === null) return null;
  const { id, init_point } = json as Record<string, unknown>;
  if (typeof id !== "string" || id === "" || id.length > 100) return null;
  return { id, initPoint: typeof init_point === "string" ? init_point : null };
}
