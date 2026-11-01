import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));
const revocacion = vi.fn();
const esAdminRpc = vi.fn();
vi.mock("react", async (original) => ({ ...(await original<typeof import("react")>()), cache: <T,>(f: T) => f }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: (nombre: string, args: unknown) => esAdminRpc(nombre, args),
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => revocacion() }) }) }),
  }),
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
    revocacion.mockReset();
    esAdminRpc.mockReset();
    esAdminRpc.mockResolvedValue({ data: false, error: null });
    revocacion.mockResolvedValue({ data: null, error: null });
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
    await expect(requireAdmin()).resolves.toEqual({ id: "u1", email: "ana@example.com", rol: "dueno" });
  });
  it("cookie emitida antes del último logout -> pantalla de verificación", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1", email: "ana@example.com", email_confirmed_at: "x" } }, error: null });
    const emitida = Date.now() - 5 * 60_000;
    cookieGet.mockReturnValue({ value: crearToken({ userId: "u1", email: "ana@example.com", ahoraMs: emitida, secreto: SECRETO }) });
    revocacion.mockResolvedValue({ data: { revocado_desde: new Date(emitida + 60_000).toISOString() }, error: null });
    await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT:/adminvita/verificar");
  });
  it("cookie emitida después del logout sigue valiendo", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1", email: "ana@example.com", email_confirmed_at: "x" } }, error: null });
    const ahora = Date.now();
    cookieGet.mockReturnValue({ value: crearToken({ userId: "u1", email: "ana@example.com", ahoraMs: ahora, secreto: SECRETO }) });
    revocacion.mockResolvedValue({ data: { revocado_desde: new Date(ahora - 60_000).toISOString() }, error: null });
    await expect(requireAdmin()).resolves.toMatchObject({ id: "u1" });
  });
  it("si no se puede leer la revocación, falla cerrado", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1", email: "ana@example.com", email_confirmed_at: "x" } }, error: null });
    cookieGet.mockReturnValue({ value: crearToken({ userId: "u1", email: "ana@example.com", ahoraMs: Date.now(), secreto: SECRETO }) });
    revocacion.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT:/adminvita/verificar");
  });

  describe("administradores gestionados desde la base", () => {
    const sesion = { data: { user: { id: "u9", email: "Eve@Example.com", email_confirmed_at: "x" } }, error: null };
    const cookie = () =>
      cookieGet.mockReturnValue({ value: crearToken({ userId: "u9", email: "eve@example.com", ahoraMs: Date.now(), secreto: SECRETO }) });

    it("administrador activo con cookie vigente entra con rol admin", async () => {
      getUser.mockResolvedValue(sesion);
      cookie();
      esAdminRpc.mockResolvedValue({ data: true, error: null });
      await expect(requireAdmin()).resolves.toEqual({ id: "u9", email: "eve@example.com", rol: "admin" });
      expect(esAdminRpc).toHaveBeenCalledWith("admin_es_administrador", { p_email: "eve@example.com" });
    });
    it("administrador revocado o inexistente -> pantalla de ingreso", async () => {
      getUser.mockResolvedValue(sesion);
      cookie();
      await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT:/adminvita/ingresar");
    });
    it("si no se puede consultar la tabla, un administrador de la base falla cerrado", async () => {
      getUser.mockResolvedValue(sesion);
      cookie();
      esAdminRpc.mockResolvedValue({ data: null, error: { message: "boom" } });
      await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT:/adminvita/ingresar");
      esAdminRpc.mockRejectedValue(new Error("down"));
      await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT:/adminvita/ingresar");
    });
    it("un dueño entra aunque la tabla de administradores no responda (y ni se consulta)", async () => {
      getUser.mockResolvedValue({ data: { user: { id: "u1", email: "ana@example.com", email_confirmed_at: "x" } }, error: null });
      cookieGet.mockReturnValue({ value: crearToken({ userId: "u1", email: "ana@example.com", ahoraMs: Date.now(), secreto: SECRETO }) });
      esAdminRpc.mockRejectedValue(new Error("down"));
      await expect(requireAdmin()).resolves.toMatchObject({ rol: "dueno" });
      expect(esAdminRpc).not.toHaveBeenCalled();
    });
    it("email sin confirmar nunca llega a la base", async () => {
      getUser.mockResolvedValue({ data: { user: { id: "u9", email: "eve@example.com", email_confirmed_at: null } }, error: null });
      esAdminRpc.mockResolvedValue({ data: true, error: null });
      await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT:/adminvita/ingresar");
      expect(esAdminRpc).not.toHaveBeenCalled();
    });
  });
});
