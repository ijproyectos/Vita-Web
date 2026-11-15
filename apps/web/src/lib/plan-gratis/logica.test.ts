import { describe, expect, it } from "vitest";
import {
  cuotaMensual,
  cupoCuidadores,
  inicioMesAR,
  inicioMesSiguienteAR,
  LIMITE_CHAT_GRATIS,
  limiteChatEfectivo,
  planAplicable,
  rpcInexistente,
  textoCuotaConteos,
  textoCuotaEstudios,
} from "./logica";

describe("mes calendario en Argentina", () => {
  it("a mitad de mes empieza el día 1 a las 03:00 UTC (00:00 AR)", () => {
    expect(inicioMesAR(new Date("2026-11-15T12:00:00Z")).toISOString()).toBe("2026-11-01T03:00:00.000Z");
  });
  it("el último minuto del mes en AR todavía es del mes viejo", () => {
    // 2026-12-01T02:59:59Z = 30/11 23:59:59 en Argentina.
    expect(inicioMesAR(new Date("2026-12-01T02:59:59Z")).toISOString()).toBe("2026-11-01T03:00:00.000Z");
  });
  it("a las 00:00 AR del día 1 ya es el mes nuevo", () => {
    expect(inicioMesAR(new Date("2026-12-01T03:00:00Z")).toISOString()).toBe("2026-12-01T03:00:00.000Z");
  });
  it("el 1° a las 01:00 UTC todavía es el mes anterior en AR", () => {
    expect(inicioMesAR(new Date("2026-12-01T01:00:00Z")).toISOString()).toBe("2026-11-01T03:00:00.000Z");
  });
  it("cruza el año", () => {
    expect(inicioMesAR(new Date("2027-01-01T02:00:00Z")).toISOString()).toBe("2026-12-01T03:00:00.000Z");
    expect(inicioMesSiguienteAR(new Date("2026-12-15T12:00:00Z")).toISOString()).toBe("2027-01-01T03:00:00.000Z");
  });
  it("el mes siguiente es el inicio del próximo mes AR", () => {
    expect(inicioMesSiguienteAR(new Date("2026-11-15T12:00:00Z")).toISOString()).toBe("2026-12-01T03:00:00.000Z");
  });
});

describe("qué estado de vita+ aplica", () => {
  it("la propia persona con vita+ alcanza", () => {
    expect(planAplicable({ propioPlus: true, adminsPlus: [] })).toBe("plus");
  });
  it("un Admin con vita+ cubre a la persona (perfil gestionado)", () => {
    expect(planAplicable({ propioPlus: false, adminsPlus: [false, true] })).toBe("plus");
  });
  it("sin ninguno es gratis", () => {
    expect(planAplicable({ propioPlus: false, adminsPlus: [] })).toBe("gratis");
    expect(planAplicable({ propioPlus: false, adminsPlus: [false] })).toBe("gratis");
  });
});

describe("chat: min(5, configurado) para gratis", () => {
  it("gratis con el límite general de 15 queda en 5", () => {
    expect(limiteChatEfectivo({ plus: false, configurado: 15 })).toBe(LIMITE_CHAT_GRATIS);
  });
  it("gratis con un límite configurado menor mantiene el menor", () => {
    expect(limiteChatEfectivo({ plus: false, configurado: 3 })).toBe(3);
  });
  it("vita+ usa el configurado, aunque sea alto", () => {
    expect(limiteChatEfectivo({ plus: true, configurado: 15 })).toBe(15);
    expect(limiteChatEfectivo({ plus: true, configurado: 200 })).toBe(200);
  });
});

describe("cuota mensual", () => {
  it("vita+ no tiene tope", () => {
    expect(cuotaMensual({ plus: true, usados: 9, limite: 1 })).toEqual({ limitada: false });
    expect(textoCuotaConteos({ limitada: false })).toBeNull();
  });
  it("gratis sin usos: queda 1", () => {
    const c = cuotaMensual({ plus: false, usados: 0, limite: 1 });
    expect(c).toEqual({ limitada: true, limite: 1, usados: 0, restantes: 1, alcanzada: false });
    expect(textoCuotaConteos(c)).toBe("Te queda 1 conteo con foto este mes.");
    expect(textoCuotaEstudios(c)).toBe("Te queda 1 estudio para cargar este mes.");
  });
  it("gratis con 1 uso: alcanzada, y nunca queda en negativo", () => {
    const c = cuotaMensual({ plus: false, usados: 3, limite: 1 });
    expect(c).toMatchObject({ restantes: 0, alcanzada: true });
    expect(textoCuotaEstudios(c)).toBe("Este mes ya cargaste tu estudio del plan gratis.");
    expect(textoCuotaConteos(c)).toBe("Este mes ya usaste tu conteo con foto del plan gratis.");
  });
  it("un valor inválido cuenta como 0 usos", () => {
    expect(cuotaMensual({ plus: false, usados: Number.NaN, limite: 1 })).toMatchObject({ usados: 0, alcanzada: false });
  });
});

describe("cupo de cuidadores", () => {
  it("gratis con 0 puede sumar uno; con 1 o más no", () => {
    expect(cupoCuidadores({ plus: false, usados: 0 })).toMatchObject({ alcanzado: false });
    expect(cupoCuidadores({ plus: false, usados: 1 })).toMatchObject({ alcanzado: true });
    expect(cupoCuidadores({ plus: false, usados: 3 })).toMatchObject({ alcanzado: true });
  });
  it("vita+ no tiene tope", () => {
    expect(cupoCuidadores({ plus: true, usados: 7 })).toEqual({ limitado: false });
  });
});

describe("migración sin aplicar", () => {
  it("reconoce función o tabla inexistente", () => {
    expect(rpcInexistente({ code: "PGRST202" })).toBe(true);
    expect(rpcInexistente({ code: "42P01" })).toBe(true);
    expect(rpcInexistente({ message: "Could not find the function public.x in the schema cache" })).toBe(true);
  });
  it("otros errores no", () => {
    expect(rpcInexistente({ code: "23505" })).toBe(false);
    expect(rpcInexistente(null)).toBe(false);
  });
});
