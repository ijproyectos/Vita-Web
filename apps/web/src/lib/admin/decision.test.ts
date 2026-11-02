import { describe, expect, it } from "vitest";
import { autorizarGestionAdmins, decidirAcceso, esDueno, normalizarEmailAdmin, parsearAdminEmails } from "./decision";

describe("parsearAdminEmails", () => {
  it("normaliza mayúsculas, espacios y duplicados", () => {
    expect(parsearAdminEmails(" Ana@Example.com , bob@example.com,ANA@example.com ")).toEqual(["ana@example.com", "bob@example.com"]);
  });
  it("vacío o ausente = nadie", () => {
    expect(parsearAdminEmails("")).toEqual([]);
    expect(parsearAdminEmails("  , ,")).toEqual([]);
    expect(parsearAdminEmails(undefined)).toEqual([]);
    expect(parsearAdminEmails(null)).toEqual([]);
  });
});

describe("decidirAcceso", () => {
  const lista = ["ana@example.com"];
  const ok = { email: "Ana@Example.com", email_confirmed_at: "2026-01-01T00:00:00Z" };

  it("sin sesión", () => {
    expect(decidirAcceso(null, lista)).toEqual({ permitido: false, motivo: "sin_sesion" });
  });
  it("lista vacía no deja pasar a nadie", () => {
    expect(decidirAcceso(ok, [])).toEqual({ permitido: false, motivo: "lista_vacia" });
  });
  it("email sin confirmar", () => {
    expect(decidirAcceso({ email: "ana@example.com", email_confirmed_at: null }, lista)).toEqual({
      permitido: false,
      motivo: "email_sin_confirmar",
    });
  });
  it("fuera de la lista", () => {
    expect(decidirAcceso({ email: "otra@example.com", email_confirmed_at: "x" }, lista)).toEqual({
      permitido: false,
      motivo: "fuera_de_lista",
    });
  });
  it("en la lista, sin importar mayúsculas", () => {
    expect(decidirAcceso(ok, lista)).toEqual({ permitido: true, email: "ana@example.com", rol: "dueno" });
  });
  it("identidad de Google verificada cuenta como confirmada", () => {
    const g = { email: "ana@example.com", identities: [{ provider: "google", identity_data: { email_verified: true } }] };
    expect(decidirAcceso(g, lista)).toEqual({ permitido: true, email: "ana@example.com", rol: "dueno" });
    const noVerificada = { email: "ana@example.com", identities: [{ provider: "google", identity_data: { email_verified: false } }] };
    expect(decidirAcceso(noVerificada, lista).permitido).toBe(false);
  });
  it("sin email", () => {
    expect(decidirAcceso({ email: null, email_confirmed_at: "x" }, lista)).toEqual({ permitido: false, motivo: "sin_email" });
  });
});

describe("dueños y administradores", () => {
  const duenos = ["ana@example.com"];
  const conf = (email: string) => ({ email, email_confirmed_at: "2026-01-01T00:00:00Z" });

  it("un dueño entra con rol dueno", () => {
    expect(decidirAcceso(conf("Ana@Example.com"), duenos, [])).toEqual({ permitido: true, email: "ana@example.com", rol: "dueno" });
  });
  it("un administrador de la base entra con rol admin", () => {
    expect(decidirAcceso(conf("bob@example.com"), duenos, ["bob@example.com"])).toEqual({ permitido: true, email: "bob@example.com", rol: "admin" });
  });
  it("si es dueño y además está en la base, manda el rol dueno", () => {
    expect(decidirAcceso(conf("ana@example.com"), duenos, ["ana@example.com"])).toMatchObject({ rol: "dueno" });
  });
  it("ni dueño ni administrador -> fuera de lista", () => {
    expect(decidirAcceso(conf("eve@example.com"), duenos, ["bob@example.com"])).toEqual({ permitido: false, motivo: "fuera_de_lista" });
  });
  it("un administrador de la base exige email confirmado", () => {
    expect(decidirAcceso({ email: "bob@example.com", email_confirmed_at: null }, duenos, ["bob@example.com"])).toEqual({
      permitido: false,
      motivo: "email_sin_confirmar",
    });
  });
  it("sin dueños configurados nadie entra, ni siquiera los de la base", () => {
    expect(decidirAcceso(conf("bob@example.com"), [], ["bob@example.com"])).toEqual({ permitido: false, motivo: "lista_vacia" });
  });
});

describe("autorizarGestionAdmins / esDueno / normalizarEmailAdmin", () => {
  it("solo los dueños gestionan administradores", () => {
    expect(autorizarGestionAdmins("dueno")).toEqual({ ok: true });
    expect(autorizarGestionAdmins("admin")).toMatchObject({ ok: false });
  });
  it("esDueno normaliza", () => {
    expect(esDueno(" ANA@example.com ", ["ana@example.com"])).toBe(true);
    expect(esDueno("bob@example.com", ["ana@example.com"])).toBe(false);
  });
  it("normaliza y valida emails", () => {
    expect(normalizarEmailAdmin("  Bob@Example.COM ")).toBe("bob@example.com");
    for (const malo of ["", "bob", "bob@", "@x.com", "bob@x", "a b@x.com", "a@b@c.com", 5, null, undefined]) {
      expect(normalizarEmailAdmin(malo)).toBeNull();
    }
  });
});
