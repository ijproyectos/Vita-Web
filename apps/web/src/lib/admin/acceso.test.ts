import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import { requireAdmin } from "./acceso";

describe("requireAdmin", () => {
  beforeEach(() => {
    getUser.mockReset();
    process.env.ADMIN_EMAILS = "ana@example.com, bob@example.com";
  });

  it("sin sesión -> 404", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(requireAdmin()).rejects.toThrow("NEXT_NOT_FOUND");
  });
  it("error de Auth -> 404", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: "jwt expired" } });
    await expect(requireAdmin()).rejects.toThrow("NEXT_NOT_FOUND");
  });
  it("email sin confirmar -> 404", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "1", email: "ana@example.com", email_confirmed_at: null } }, error: null });
    await expect(requireAdmin()).rejects.toThrow("NEXT_NOT_FOUND");
  });
  it("fuera de la lista -> 404", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "1", email: "eve@example.com", email_confirmed_at: "x" } }, error: null });
    await expect(requireAdmin()).rejects.toThrow("NEXT_NOT_FOUND");
  });
  it("ADMIN_EMAILS vacío -> 404 aunque haya sesión", async () => {
    process.env.ADMIN_EMAILS = "";
    getUser.mockResolvedValue({ data: { user: { id: "1", email: "ana@example.com", email_confirmed_at: "x" } }, error: null });
    await expect(requireAdmin()).rejects.toThrow("NEXT_NOT_FOUND");
  });
  it("admin confirmado -> devuelve id y email normalizado", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1", email: "Ana@Example.com", email_confirmed_at: "x" } }, error: null });
    await expect(requireAdmin()).resolves.toEqual({ id: "u1", email: "ana@example.com" });
  });
});
