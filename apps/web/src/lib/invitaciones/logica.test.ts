import { describe, expect, it } from "vitest";
import { abreEnLaPersona, esCodigoSeis, mailCoincide, textoInvitacionAceptada } from "./logica";

describe("invitación", () => {
  it("compara el mail sin mayúsculas ni espacios", () => {
    expect(mailCoincide("martina@gmail.com", " Martina@Gmail.com ")).toBe(true);
    expect(mailCoincide("martina@gmail.com", "otra@gmail.com")).toBe(false);
    expect(mailCoincide("martina@gmail.com", null)).toBe(false);
  });
  it("solo acepta seis dígitos", () => {
    expect(esCodigoSeis("482916")).toBe(true);
    expect(esCodigoSeis("48291")).toBe(false);
    expect(esCodigoSeis("48291a")).toBe(false);
  });
  it("un Lector o alguien nuevo abre en la persona; un Admin con perfil sigue en su inicio", () => {
    expect(abreEnLaPersona("ver", true)).toBe(true);
    expect(abreEnLaPersona("editar", false)).toBe(true);
    expect(abreEnLaPersona("editar", true)).toBe(false);
  });
  it("el aviso cambia si invitó la propia persona", () => {
    expect(textoInvitacionAceptada({ cuidador: "Martina", persona: "Jesus", invitoLaPersona: false }).titulo).toBe("Martina ya cuida a Jesus");
    expect(textoInvitacionAceptada({ cuidador: "Martina", persona: "Jesus", invitoLaPersona: true }).titulo).toBe("Martina ya te cuida");
  });
});
