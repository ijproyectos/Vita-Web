import { describe, expect, it } from "vitest";
import {
  BAN_LEVANTAR,
  BAN_SUSPENDER,
  decidirSuspensionApp,
  leerMiSuspension,
  puedeSuspender,
  validarSuspension,
} from "./logica";

describe("leerMiSuspension", () => {
  it("lee la fila de mi_suspension()", () => {
    expect(leerMiSuspension([{ ms_motivo: "falta_de_pago", ms_desde: "2026-11-01T00:00:00Z" }])).toEqual({
      motivo: "falta_de_pago",
      desde: "2026-11-01T00:00:00Z",
    });
  });
  it("sin filas, motivos desconocidos o formas raras = sin suspensión", () => {
    expect(leerMiSuspension([])).toBeNull();
    expect(leerMiSuspension(null)).toBeNull();
    expect(leerMiSuspension([{ ms_motivo: "otra_cosa" }])).toBeNull();
    expect(leerMiSuspension("x")).toBeNull();
  });
});

describe("decidirSuspensionApp", () => {
  it("suspendida -> bloquear con el motivo", () => {
    expect(decidirSuspensionApp({ suspension: { motivo: "mal_uso", desde: null }, fallo: false })).toEqual({ accion: "bloquear", motivo: "mal_uso" });
  });
  it("sin suspensión -> seguir", () => {
    expect(decidirSuspensionApp({ suspension: null, fallo: false })).toEqual({ accion: "seguir" });
  });
  it("si la consulta falla, falla abierto (el ban de Auth sigue protegiendo)", () => {
    expect(decidirSuspensionApp({ suspension: null, fallo: true })).toEqual({ accion: "seguir" });
    expect(decidirSuspensionApp({ suspension: { motivo: "mal_uso", desde: null }, fallo: true })).toEqual({ accion: "seguir" });
  });
});

describe("validarSuspension", () => {
  it("exige un motivo válido", () => {
    expect(validarSuspension({ motivo: "", nota: "" }).ok).toBe(false);
    expect(validarSuspension({ motivo: "spam", nota: "" }).ok).toBe(false);
    expect(validarSuspension({ motivo: "mal_uso", nota: "" })).toEqual({ ok: true, motivo: "mal_uso", nota: "" });
  });
  it("recorta la nota y limita a 300", () => {
    expect(validarSuspension({ motivo: "falta_de_pago", nota: "  debe 2 meses " })).toEqual({ ok: true, motivo: "falta_de_pago", nota: "debe 2 meses" });
    expect(validarSuspension({ motivo: "mal_uso", nota: "a".repeat(300) }).ok).toBe(true);
    expect(validarSuspension({ motivo: "mal_uso", nota: "a".repeat(301) }).ok).toBe(false);
    expect(validarSuspension({ motivo: "mal_uso", nota: 5 })).toEqual({ ok: true, motivo: "mal_uso", nota: "" });
  });
});

describe("puedeSuspender", () => {
  const duenos = ["ana@example.com"];
  const admins = ["bob@example.com"];
  it("nunca a un dueño", () => {
    expect(puedeSuspender("Ana@Example.com", duenos, admins)).toMatchObject({ ok: false, razon: "dueno" });
  });
  it("nunca a un administrador", () => {
    expect(puedeSuspender(" bob@example.com ", duenos, admins)).toMatchObject({ ok: false, razon: "administrador" });
  });
  it("a cualquier otra cuenta sí, incluso sin email", () => {
    expect(puedeSuspender("eve@example.com", duenos, admins)).toEqual({ ok: true });
    expect(puedeSuspender(null, duenos, admins)).toEqual({ ok: true });
    expect(puedeSuspender(undefined, duenos, admins)).toEqual({ ok: true });
  });
});

describe("ban de Auth", () => {
  it("duraciones", () => {
    expect(BAN_SUSPENDER).toBe("876000h");
    expect(BAN_LEVANTAR).toBe("none");
  });
});
