import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/dal", () => ({
  requireUser: vi.fn(async () => ({ id: "yo", user_metadata: {} })),
}));

let cookie: string | undefined;
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: () => (cookie ? { value: cookie } : undefined) })),
}));

let lecturaFamilia: { data: unknown; error: { message: string } | null };
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    rpc: async () => lecturaFamilia,
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { nombre: "Mica", color: "teal" } }) }),
      }),
    }),
  })),
}));

import { esPerfilValido, obtenerPerfilActivo, perfilActivoEditable, rolSobre } from "./perfil-activo";
import { requireUser } from "@/lib/dal";

const JESUS = { vinculo_id: "v1", elder_id: "jesus", nombre: "Jesus", color: "violeta", rol: "ver", relacion: null, conectado: false };

describe("obtenerPerfilActivo", () => {
  beforeEach(() => {
    cookie = undefined;
    lecturaFamilia = { data: [JESUS], error: null };
  });

  it("abre a la persona elegida si el vínculo existe", async () => {
    cookie = "jesus";
    await expect(obtenerPerfilActivo()).resolves.toMatchObject({ id: "jesus", esPropio: false, rol: "ver" });
  });

  it("con una persona elegida, si no se puede leer la familia lanza en vez de abrir el perfil propio", async () => {
    cookie = "jesus";
    lecturaFamilia = { data: null, error: { message: "caído" } };
    await expect(obtenerPerfilActivo()).rejects.toThrow("No se pudo leer la familia");
  });

  it("si la lectura anda y el vínculo ya no existe, vuelve al perfil propio", async () => {
    cookie = "jesus";
    lecturaFamilia = { data: [], error: null };
    await expect(obtenerPerfilActivo()).resolves.toMatchObject({ id: "yo", esPropio: true });
  });

  it("sin persona elegida, una lectura fallida no rompe: el activo es el propio", async () => {
    lecturaFamilia = { data: null, error: { message: "caído" } };
    await expect(obtenerPerfilActivo()).resolves.toMatchObject({ id: "yo", esPropio: true });
  });

  describe("desde una Server Action, si no se puede leer la familia con una persona elegida", () => {
    beforeEach(() => {
      cookie = "jesus";
      lecturaFamilia = { data: null, error: { message: "caído" } };
    });

    it("niega la operación sin lanzar", async () => {
      await expect(perfilActivoEditable()).resolves.toMatchObject({ ok: false });
      await expect(rolSobre("jesus")).resolves.toBeNull();
      await expect(esPerfilValido("jesus")).resolves.toBe(false);
    });

    it("deja pasar la redirección de sesión", async () => {
      const redireccion = new Error("NEXT_REDIRECT");
      vi.mocked(requireUser).mockRejectedValueOnce(redireccion);
      await expect(perfilActivoEditable()).rejects.toBe(redireccion);
    });
  });
});
