import { describe, expect, it } from "vitest";
import { enmascararEmail } from "./enmascarar";

describe("enmascararEmail", () => {
  it("deja la primera letra y el dominio", () => {
    expect(enmascararEmail("martina@gmail.com")).toBe("m•••@gmail.com");
  });

  it("ignora espacios alrededor", () => {
    expect(enmascararEmail("  tini.r@hotmail.com ")).toBe("t•••@hotmail.com");
  });

  it("usa la última arroba como separador", () => {
    expect(enmascararEmail("a@b@dominio.com")).toBe("a•••@dominio.com");
  });

  it("no corta un carácter fuera del plano básico", () => {
    expect(enmascararEmail("😀ana@mail.com")).toBe("😀•••@mail.com");
  });

  it.each([[""], ["   "], ["sin-arroba"], ["@dominio.com"], ["usuario@"], [null], [undefined]])(
    "devuelve ••• ante %j",
    (entrada) => {
      expect(enmascararEmail(entrada)).toBe("•••");
    }
  );
});
