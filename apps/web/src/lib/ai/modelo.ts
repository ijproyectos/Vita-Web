// Modelo de Anthropic que usan el chat y los extractores (estudios, onboarding,
// conteo de pastillas). Para cambiarlo, editar solo esta constante: es una
// decisión de producto/costo, no de cada llamador.
export const MODELO_IA = "claude-sonnet-5";

// Tope de tokens de salida por turno del chat con vita (los extractores
// definen el suyo, más chico, en cada archivo).
export const MAX_TOKENS_CHAT = 2048;

// Resumen incremental de la conversación (memoria, M5): trabajo de segundo plano, corto y estructurado,
// por eso va con Haiku 5.5 (el más barato) y no con el modelo del chat. Llamada normal a la Messages API
// (no Batch: un lote puede tardar hasta 24 h y el resumen tiene que estar listo en minutos).
export const MODELO_RESUMEN = "claude-haiku-5-5";

// Tope de tokens de salida del resumen (incluye el razonamiento adaptativo, que Haiku 5.5 trae prendido por
// defecto; el resumen en sí apunta a ~1.200 tokens como máximo). Se usa effort "low" para que el razonamiento
// no se coma este margen.
export const MAX_TOKENS_RESUMEN = 2000;
