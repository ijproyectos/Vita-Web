// Modelo de Anthropic que usan el chat y los extractores (estudios, onboarding,
// conteo de pastillas). Para cambiarlo, editar solo esta constante: es una
// decisión de producto/costo, no de cada llamador.
export const MODELO_IA = "claude-sonnet-5";

// Tope de tokens de salida por turno del chat con vita (los extractores
// definen el suyo, más chico, en cada archivo).
export const MAX_TOKENS_CHAT = 2048;
