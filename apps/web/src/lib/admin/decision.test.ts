import { describe, expect, it } from "vitest";
import { decidirAcceso, parsearAdminEmails } from "./decision";

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
    expect(decidirAcceso(ok, lista)).toEqual({ permitido: true, email: "ana@example.com" });
  });
  it("identidad de Google verificada cuenta como confirmada", () => {
    const g = { email: "ana@example.com", identities: [{ provider: "google", identity_data: { email_verified: true } }] };
    expect(decidirAcceso(g, lista)).toEqual({ permitido: true, email: "ana@example.com" });
    const noVerificada = { email: "ana@example.com", identities: [{ provider: "google", identity_data: { email_verified: false } }] };
    expect(decidirAcceso(noVerificada, lista).permitido).toBe(false);
  });
  it("sin email", () => {
    expect(decidirAcceso({ email: null, email_confirmed_at: "x" }, lista)).toEqual({ permitido: false, motivo: "sin_email" });
  });
});
