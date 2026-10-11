// Tokens de marca espejados en hex para plantillas de email.
//
// EXCEPCIÓN deliberada a la regla "no hardcodear colores" (AGENTS.md): los
// clientes de correo (Gmail/Outlook) eliminan las variables CSS, así que el
// HTML de email no puede usar `var(--teal)`. Fuente de verdad: los tokens de
// `src/app/globals.css` (--teal, --teal-deep, --mint, --cream, --ink,
// --slate, --amber, --card). Si cambian allá, se actualizan acá. Cualquier
// color de email sale de este archivo.
export const MARCA = {
  teal: "#0d9b8e",
  tealDeep: "#0a7a6e",
  mint: "#d7f0ec",
  cream: "#faf8f4",
  ink: "#0f1923",
  slate: "#4a5568",
  amber: "#f2b872",
  card: "#ffffff",
} as const;

export const FUENTE_EMAIL =
  "'Plus Jakarta Sans', -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
export const FUENTE_CODIGO = "'SF Mono', Menlo, Consolas, 'Courier New', monospace";
