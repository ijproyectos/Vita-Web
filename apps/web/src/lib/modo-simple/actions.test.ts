import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/dal", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/familia/perfil-activo", () => ({ rolSobre: vi.fn() }));
vi.mock("@/lib/mediciones/nucleo", () => ({ agregar: vi.fn() }));
vi.mock("./nucleo", () => ({ actualizarPrefs: vi.fn() }));

const { requireUser } = await import("@/lib/dal");
const { createClient } = await import("@/lib/supabase/server");
const { agregar } = await import("@/lib/mediciones/nucleo");
const { revalidatePath } = await import("next/cache");
const { guardarMedicionSimpleAction } = await import("./actions");

const supabase = { tag: "sesion" };

beforeEach(() => {
  vi.mocked(requireUser).mockReset().mockResolvedValue({ id: "u-logueado" } as never);
  vi.mocked(createClient).mockReset().mockResolvedValue(supabase as never);
  vi.mocked(agregar).mockReset().mockResolvedValue(undefined as never);
  vi.mocked(revalidatePath).mockReset();
});

describe("guardarMedicionSimpleAction", () => {
  it("guarda la glucemia para la cuenta logueada y refresca Mi Salud", async () => {
    await expect(guardarMedicionSimpleAction({ tipo: "glucemia", valor: 110 })).resolves.toEqual({ status: "success" });
    expect(agregar).toHaveBeenCalledTimes(1);
    const [cliente, usuarioId, datos] = vi.mocked(agregar).mock.calls[0];
    expect(cliente).toBe(supabase);
    expect(usuarioId).toBe("u-logueado");
    expect(datos).toMatchObject({ tipo: "glucemia", valor: 110 });
    expect(revalidatePath).toHaveBeenCalledWith("/app/mi-salud");
  });

  it("guarda la presión con máxima y mínima", async () => {
    await expect(guardarMedicionSimpleAction({ tipo: "presion", valor: 130, valorSecundario: 80 })).resolves.toEqual({ status: "success" });
    expect(vi.mocked(agregar).mock.calls[0][2]).toMatchObject({ tipo: "presion", valor: 130, valorSecundario: 80 });
  });

  it("un tipo desconocido no guarda nada", async () => {
    const r = await guardarMedicionSimpleAction({ tipo: "peso" as never, valor: 70 });
    expect(r.status).toBe("error");
    expect(agregar).not.toHaveBeenCalled();
  });

  it("un valor fuera de rango vuelve con el mensaje de validación y no guarda", async () => {
    const r = await guardarMedicionSimpleAction({ tipo: "presion", valor: 80, valorSecundario: 130 });
    expect(r).toEqual({ status: "error", message: expect.stringContaining("máxima") });
    expect(agregar).not.toHaveBeenCalled();
  });

  it("si la base falla devuelve error en vez de lanzar", async () => {
    vi.mocked(agregar).mockRejectedValue(new Error("db"));
    await expect(guardarMedicionSimpleAction({ tipo: "glucemia", valor: 110 })).resolves.toEqual({
      status: "error",
      message: "No pudimos anotarlo. Probá de nuevo.",
    });
  });
});
