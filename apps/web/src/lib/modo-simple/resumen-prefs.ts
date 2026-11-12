import type { PrefsModoSimple } from "./tipos";

/** One-line summary of a person's simple mode, as the V7 person card shows it ("Con voz · puede posponer"). */
export function resumenPrefsModoSimple(p: Pick<PrefsModoSimple, "voz" | "posponer">): string {
  return `${p.voz ? "Con voz" : "Sin voz"} · ${p.posponer ? "puede posponer" : "sin posponer"}`;
}
