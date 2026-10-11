// Palabra que el usuario tiene que escribir para confirmar la baja de su
// cuenta — compartida entre el diálogo (cliente) y la Server Action.
export const PALABRA_CONFIRMACION = "ELIMINAR";

export type EstadoEliminarCuenta = { status: "idle" } | { status: "error"; mensaje: string };
