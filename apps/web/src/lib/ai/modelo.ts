// Modelo de Anthropic que usan el chat y los extractores (estudios, onboarding,
// conteo de pastillas). Para cambiarlo, editar solo esta constante: es una
// decisión de producto/costo, no de cada llamador.
export const MODELO_IA = "claude-sonnet-5";

// Tope de tokens de salida por turno del chat con vita (los extractores
// definen el suyo, más chico, en cada archivo).
export const MAX_TOKENS_CHAT = 2048;

// Modelo del resumen incremental de la conversación (memoria, fase 3): trabajo de fondo, barato y rápido.
// El costo se registra con `registrarUsoIA` y sale de lib/uso-ia/precios.ts.
export const MODELO_RESUMEN = "claude-haiku-5-5";
// Tope de tokens de salida de UN resumen (~300 palabras + pendientes, con holgura).
export const MAX_TOKENS_RESUMEN = 1200;
