// Que muestra /app al abrirse. El modo simple es siempre de la cuenta
// logueada: si el perfil activo es el de otra persona en vista de solo mirar
// (Lector), manda la vista de solo mirar; si no, el modo simple activo gana
// sobre el Inicio normal.
export type DestinoInicio = "solo-mirar" | "modo-simple" | "normal";

export function destinoDeInicio({ soloMirar, modoSimpleActivo }: { soloMirar: boolean; modoSimpleActivo: boolean }): DestinoInicio {
  if (soloMirar) return "solo-mirar";
  if (modoSimpleActivo) return "modo-simple";
  return "normal";
}
