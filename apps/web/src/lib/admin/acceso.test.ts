import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));
const cookieGet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: cookieGet }),
}));
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => {
    throw new Error(`NEXT_REDIRECT:${destino}`);
  },
}));

import { requireAdmin } from "./acceso";
import { COOKIE_ADMIN, crearToken } from "./sesion";

const SECRETO = "s".repeat(40);

describe("requireAdmin", () => {
  beforeEach(() => {
    getUser.mockReset();
    cookieGet.mockReset();
    cookieGet.mockReturnValue(undefined);
    process.env.ADMIN_EMAILS = "ana@example.com, bob@example.com";
    process.env.ADMIN_SESSION_SECRET = SECRETO;
  });

  it("sin sesión -> pantalla de ingreso", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT:/adminvita/ingresar");
  });
  it("error de Auth -> pantalla de ingreso", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: "jwt expired" } });
    await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT:/adminvita/ingresar");
  });
  it("email sin confirmar -> pantalla de ingreso", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "1", email: "ana@example.com", email_confirmed_at: null } }, error: null });
    await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT:/adminvita/ingresar");
  });
  it("fuera de la lista -> pantalla de ingreso", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "1", email: "eve@example.com", email_confirmed_at: "x" } }, error: null });
    await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT:/adminvita/ingresar");
  });
  it("ADMIN_EMAILS vacío -> pantalla de ingreso aunque haya sesión", async () => {
    process.env.ADMIN_EMAILS = "";
    getUser.mockResolvedValue({ data: { user: { id: "1", email: "ana@example.com", email_confirmed_at: "x" } }, error: null });
    await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT:/adminvita/ingresar");
  });
  it("admin sin cookie de verificación -> pantalla de verificación", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1", email: "ana@example.com", email_confirmed_at: "x" } }, error: null });
    await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT:/adminvita/verificar");
  });
  it("cookie de otro usuario o manipulada -> pantalla de verificación", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1", email: "ana@example.com", email_confirmed_at: "x" } }, error: null });
    cookieGet.mockImplementation((n: string) =>
      n === COOKIE_ADMIN ? { value: crearToken({ userId: "otro", email: "ana@example.com", ahoraMs: Date.now(), secreto: SECRETO }) } : undefined,
    );
    await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT:/adminvita/verificar");
  });
  it("cookie vencida -> pantalla de verificación", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1", email: "ana@example.com", email_confirmed_at: "x" } }, error: null });
    cookieGet.mockReturnValue({ value: crearToken({ userId: "u1", email: "ana@example.com", ahoraMs: Date.now() - 31 * 60_000, secreto: SECRETO }) });
    await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT:/adminvita/verificar");
  });
  it("sin ADMIN_SESSION_SECRET nadie pasa, ni con una cookie bien formada", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1", email: "ana@example.com", email_confirmed_at: "x" } }, error: null });
    cookieGet.mockReturnValue({ value: crearToken({ userId: "u1", email: "ana@example.com", ahoraMs: Date.now(), secreto: SECRETO }) });
    delete process.env.ADMIN_SESSION_SECRET;
    await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT:/adminvita/verificar");
  });
  it("admin confirmado con cookie vigente -> devuelve id y email normalizado", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1", email: "Ana@Example.com", email_confirmed_at: "x" } }, error: null });
    cookieGet.mockReturnValue({ value: crearToken({ userId: "u1", email: "ana@example.com", ahoraMs: Date.now(), secreto: SECRETO }) });
    await expect(requireAdmin()).resolves.toEqual({ id: "u1", email: "ana@example.com" });
  });
});
