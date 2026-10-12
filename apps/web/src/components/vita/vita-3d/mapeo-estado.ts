import type { EstadoAvatar } from "../estados-avatar";
import type { Intencion } from "./motor";

// EstadoAvatar (lo que decide cada pantalla) -> intención del personaje 3D.
// Sin importar three: este archivo entra en el bundle inicial.
//   happy      -> alegre
//   empathetic -> triste suavizado (mezcla 60% triste / 40% seguimiento)
//   alert      -> triste (dosis omitida)
//   idle/calm  -> seguimiento (calm, algo más lento)
//   listening  -> seguimiento, ojos más grandes, mirada al centro
//   thinking   -> seguimiento, mirada arriba, más lento
//   typing     -> seguimiento, mirada abajo (hacia el campo de texto), ojos
//                 algo más grandes y velocidad levemente reducida
//   speaking   -> conserva el mood actual (pesos null); la boca se abre con
//                 el RMS del audio de salida
const SEGUIMIENTO = { alegre: 0, triste: 0, enojo: 0, seguimiento: 1 };

export function intencionDe(estado: EstadoAvatar): Intencion {
  const base: Intencion = { pesos: SEGUIMIENTO, mirada: "puntero", ojosExtra: 1, velocidad: 1, hablando: false };
  switch (estado) {
    case "happy":
      return { ...base, pesos: { alegre: 1, triste: 0, enojo: 0, seguimiento: 0 } };
    case "empathetic":
      return { ...base, pesos: { alegre: 0, triste: 0.6, enojo: 0, seguimiento: 0.4 }, velocidad: 0.8 };
    case "alert":
      return { ...base, pesos: { alegre: 0, triste: 1, enojo: 0, seguimiento: 0 } };
    case "calm":
      return { ...base, velocidad: 0.8 };
    case "listening":
      return { ...base, mirada: "centro", ojosExtra: 1.2 };
    case "thinking":
      return { ...base, mirada: "arriba", velocidad: 0.6 };
    case "typing":
      return { ...base, mirada: "abajo", ojosExtra: 1.12, velocidad: 0.85 };
    case "speaking":
      return { ...base, pesos: null, hablando: true };
    default:
      return base;
  }
}
