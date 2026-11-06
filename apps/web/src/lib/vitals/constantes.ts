// Constantes de la medicion de velocidad real, sin dependencias: las importa el cliente (no debe arrastrar zod).

export const METRICAS_VITALS = ["LCP", "INP", "CLS", "FCP", "TTFB"] as const;
export type MetricaVital = (typeof METRICAS_VITALS)[number];

export const RATINGS_VITALS = ["good", "needs-improvement", "poor"] as const;
export const NAVEGACIONES_VITALS = ["navigate", "reload", "back-forward", "back-forward-cache", "prerender", "restore"] as const;

export const MAX_METRICAS_POR_ENVIO = 10;
export const MAX_BYTES_ENVIO = 4096;
