import { describe, expect, it } from "vitest";
import { enmascararEmail } from "./enmascarar";

describe("enmascararEmail", () => {
  it("deja ver las dos primeras letras y el dominio", () => {
    expect(enmascararEmail("martina@gmail.com")).toBe("ma•••@gmail.com");
  });
  it("con un usuario muy corto deja ver solo la primera letra", () => {
    expect(enmascararEmail("ab@x.com")).toBe("a•••@x.com");
    expect(enmascararEmail("a@x.com")).toBe("a•••@x.com");
  });
  it("recorta espacios", () => {
    expect(enmascararEmail("  martina@gmail.com ")).toBe("ma•••@gmail.com");
  });
  it("algo que no es un email no se muestra", () => {
    expect(enmascararEmail("sin-arroba")).toBe("•••");
    expect(enmascararEmail("@gmail.com")).toBe("•••");
    expect(enmascararEmail("martina@")).toBe("•••");
  });
});
