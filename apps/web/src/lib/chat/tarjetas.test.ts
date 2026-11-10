import { describe, expect, it } from "vitest";
import { agruparTarjetas, contenidoSinTarjetas, leerTarjetas, tarjetasParaGuardar, tituloHoyGuardado } from "./tarjetas";

const med = (name: string, persona?: string) => ({ type: "medication_added", name, ...(persona ? { persona } : {}) });

describe("tarjetas del chat", () => {
  it("guarda solo las que tienen sentido al reabrir", () => {
    const r = tarjetasParaGuardar([{ type: "memoria_guardada" }, { type: "avatar_mood" }, med("A"), { type: "opciones_confirmacion" }]);
    expect(r.map((t) => t.type)).toEqual(["medication_added"]);
  });
  it("agrupa las del mismo tipo y deja sueltas las demás", () => {
    const r = agruparTarjetas([med("A", "Jesus"), { type: "open_screen" }, med("B", "Jesus")]);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ type: "grupo", tipo: "medication_added", persona: "Jesus" });
    expect(r[1].type).toBe("open_screen");
  });
  it("una sola no se agrupa", () => {
    expect(agruparTarjetas([med("A")])).toEqual([med("A")]);
  });
  it("con personas distintas el grupo no nombra a nadie", () => {
    expect(agruparTarjetas([med("A", "Jesus"), med("B", "Elsa")])[0]).toMatchObject({ persona: null });
  });
  it("de la lista de hoy queda la última", () => {
    const r = agruparTarjetas([{ type: "show_today_medications", n: 1 }, { type: "show_today_medications", n: 2 }]);
    expect(r).toEqual([{ type: "show_today_medications", n: 2 }]);
  });
  it("descarta lo que no es una tarjeta", () => {
    expect(leerTarjetas([{ type: "x" }, 3, null, {}])).toEqual([{ type: "x" }]);
    expect(leerTarjetas("x")).toEqual([]);
  });
  it("sin la columna, una frase suelta se reemplaza y lo demás no", () => {
    const hoy = [{ type: "show_today_medications" }];
    expect(contenidoSinTarjetas("Esto te toca hoy:", hoy)).toBe("Te mostré tu rutina.");
    expect(contenidoSinTarjetas("Hoy tenés turno a las 10.", hoy)).toBe("Hoy tenés turno a las 10.");
    expect(contenidoSinTarjetas("", hoy)).toBe("Te mostré tu rutina.");
    expect(contenidoSinTarjetas("  ", [{ type: "medication_taken" }])).toBe("Listo.");
    expect(contenidoSinTarjetas("Mirá:", [med("A")])).toBe("Mirá:");
  });
  it("una tarjeta guardada dice de cuándo es", () => {
    const ahora = new Date("2026-11-09T21:00:00Z");
    expect(tituloHoyGuardado("2026-11-09T18:40:00Z", ahora)).toBe("Hoy, a las 15:40");
    expect(tituloHoyGuardado("2026-11-02T18:40:00Z", ahora)).toBe("lunes 2 de noviembre");
  });
});
