import type { RolCuidador } from "./avisos-familia-reglas";

export type AvisoCuidador = { titulo: string; detalle: string };

/**
 * Avisos que recibe un cuidador según su rol (lista para mostrar al aceptar una
 * invitación). Espeja `cuidadorRecibe` y el aviso de tomas sin confirmar: el
 * stock va solo a Admin. Si cambian esas reglas, cambia esta lista.
 */
export function avisosDeCuidador(rol: RolCuidador): AvisoCuidador[] {
  return [
    { titulo: "Tomas sin confirmar", detalle: "Si no la confirma a tiempo" },
    ...(rol === "editar" ? [{ titulo: "Remedio por terminarse", detalle: "Cuando quedan pocos" }] : []),
    { titulo: "Turnos", detalle: "El día antes" },
    { titulo: "Resumen del día", detalle: "A la noche" },
  ];
}
