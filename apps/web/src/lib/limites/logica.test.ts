import { describe, expect, it } from "vitest";
import {
  claveLimite,
  inicioVentana,
  ipDeHeaders,
  LIMITES_CHAT,
  LIMITES_VOZ,
  segundosHastaFinDeVentana,
  superaLimite,
} from "./logica";

describe("ventanas", () => {
  const t = Date.parse("2026-10-28T15:30:42.500Z");
  it("minuto UTC", () => {
    expect(inicioVentana(t, "min").toISOString()).toBe("2026-10-28T15:30:00.000Z");
    expect(segundosHastaFinDeVentana(t, "min")).toBe(18);
  });
  it("día calendario de Argentina (UTC-3)", () => {
    expect(inicioVentana(t, "dia").toISOString()).toBe("2026-10-28T03:00:00.000Z");
    // 01:00 UTC del 29 todavía es el 28 en Argentina
    expect(inicioVentana(Date.parse("2026-10-29T01:00:00Z"), "dia").toISOString()).toBe("2026-10-28T03:00:00.000Z");
    expect(inicioVentana(Date.parse("2026-10-29T03:00:00Z"), "dia").toISOString()).toBe("2026-10-29T03:00:00.000Z");
  });
  it("retry-after mínimo 1 s", () => {
    expect(segundosHastaFinDeVentana(Date.parse("2026-10-28T15:30:59.999Z"), "min")).toBe(1);
    expect(segundosHastaFinDeVentana(Date.parse("2026-10-28T15:30:00.000Z"), "min")).toBe(60);
  });
});

describe("claves y topes", () => {
  it("claveLimite incluye endpoint, sujeto y ventana", () => {
    expect(claveLimite(LIMITES_CHAT[0], "u1")).toBe("chat:u:u1:min");
    expect(claveLimite(LIMITES_VOZ[0], "u1")).toBe("voz:u:u1:min");
  });
  it("superaLimite: el pedido número max aún pasa, el siguiente no", () => {
    expect(superaLimite(15, 15)).toBe(false);
    expect(superaLimite(16, 15)).toBe(true);
  });
  it("los topes configurados", () => {
    const f = (e: string, s: string, v: string) => LIMITES_CHAT.find((l) => l.endpoint === e && l.sujeto === s && l.ventana === v)?.maximo;
    expect(f("chat", "u", "min")).toBe(15);
    expect(f("chat", "ip", "min")).toBe(60);
    expect(f("chat", "u", "dia")).toBe(300);
    expect(LIMITES_VOZ[0].maximo).toBe(30);
  });
});

describe("ipDeHeaders", () => {
  it("prefiere la de Netlify, luego x-forwarded-for (primera), si no null", () => {
    expect(ipDeHeaders(new Headers({ "x-nf-client-connection-ip": "1.1.1.1", "x-forwarded-for": "2.2.2.2" }))).toBe("1.1.1.1");
    expect(ipDeHeaders(new Headers({ "x-forwarded-for": "2.2.2.2, 3.3.3.3" }))).toBe("2.2.2.2");
    expect(ipDeHeaders(new Headers())).toBeNull();
    expect(ipDeHeaders(new Headers({ "x-forwarded-for": " " }))).toBeNull();
  });
});
