// Tipos y cálculo puro del uso diario de IA — sin `server-only` a propósito,
// para que el cliente (overlay del chat, Perfil) pueda importar el tipo y la
// barra sin arrastrar el cliente `service_role`.

export type UsoDiario = {
  usados: number;
  limite: number;
  restantes: number;
  /** Entero 0–100. */
  porcentajeUsado: number;
};

export type UsoDiarioConEstado = UsoDiario & { agotado: boolean };

export function calcularUso(usados: number, limite: number): UsoDiarioConEstado {
  const restantes = Math.max(0, limite - usados);
  // Sin cupo (límite 0 o menor) cuenta como 100 % usado: evita el NaN de 0/0.
  const porcentajeUsado = limite > 0 ? Math.min(100, Math.max(0, Math.round((usados / limite) * 100))) : 100;
  return { usados, limite, restantes, porcentajeUsado, agotado: usados >= limite };
}
