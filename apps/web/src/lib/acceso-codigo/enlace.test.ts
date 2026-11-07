import { describe, expect, it } from "vitest";
import { mensajeCodigoAcceso, mensajeInvitacionVinculo, normalizarCodigoEnlace, rutaCodigo, urlCodigo } from "./enlace";

describe("normalizarCodigoEnlace", () => {
  it("acepta 6 dígitos, con espacios o guiones de copiado", () => {
    expect(normalizarCodigoEnlace("482916")).toBe("482916");
    expect(normalizarCodigoEnlace(" 482 916 ")).toBe("482916");
    expect(normalizarCodigoEnlace("482-916")).toBe("482916");
  });
  it("rechaza todo lo demás", () => {
    for (const malo of ["", "12345", "1234567", "12345a", "abcdef", "48291<", "../etc", "482916/x", undefined, null, 482916]) {
      expect(normalizarCodigoEnlace(malo)).toBeNull();
    }
  });
});

describe("urlCodigo y mensajes", () => {
  it("arma el link corto sin barras dobles", () => {
    expect(rutaCodigo("482916")).toBe("/c/482916");
    expect(urlCodigo("https://vitappweb.netlify.app/", "482916")).toBe("https://vitappweb.netlify.app/c/482916");
  });
  it("un código inválido no genera un link roto", () => {
    expect(urlCodigo("https://x.com", "12")).toBe("https://x.com/login");
  });
  it("el mensaje del código de acceso lleva el link directo y la vigencia", () => {
    const t = mensajeCodigoAcceso({ codigo: "482916", origen: "https://x.com" });
    expect(t).toContain("https://x.com/c/482916");
    expect(t).toContain("482916");
    expect(t).toContain("30 minutos");
    expect(t).not.toContain("/login");
  });
  it("el mensaje de invitación de vínculo lleva el link directo", () => {
    const t = mensajeInvitacionVinculo({ codigo: "482916", origen: "https://x.com" });
    expect(t).toContain("https://x.com/c/482916");
    expect(t).not.toContain("/onboarding/inicio");
  });
});
