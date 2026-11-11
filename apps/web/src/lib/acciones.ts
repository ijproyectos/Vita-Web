// Resultado de una Server Action de la app: nunca lanza, devuelve esto (ver
// "Server Actions nunca lanzan" en CLAUDE.md). Sin "use server" ni
// "server-only": lo usan tanto las acciones como los formularios del cliente.
export type EstadoAccion = { status: "idle" } | { status: "success" } | { status: "error"; message: string };
