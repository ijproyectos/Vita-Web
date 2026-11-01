import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => {
    throw new Error(`NEXT_REDIRECT:${destino}`);
  },
}));

import { requireAdmin } from "./acceso";

describe("requireAdmin", () => {
  beforeEach(() => {
    getUser.mockReset();
    process.env.ADMIN_EMAILS = "ana@example.com, bob@example.com";
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
  it("admin confirmado -> devuelve id y email normalizado", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1", email: "Ana@Example.com", email_confirmed_at: "x" } }, error: null });
    await expect(requireAdmin()).resolves.toEqual({ id: "u1", email: "ana@example.com" });
  });
});
