import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/dal", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/familia/perfil-activo", () => ({ rolSobre: vi.fn() }));
vi.mock("@/lib/mediciones/nucleo", () => ({ agregar: vi.fn() }));
vi.mock("./nucleo", () => ({ actualizarPrefs: vi.fn() }));
vi.mock("@/lib/notificaciones/pedido-ayuda", () => ({ pedirAyudaAFamilia: vi.fn() }));
vi.mock("@/lib/suspensiones/guardia", () => ({ estaSuspendida: vi.fn() }));

const { requireUser } = await import("@/lib/dal");
const { createClient } = await import("@/lib/supabase/server");
const { pedirAyudaAFamilia } = await import("@/lib/notificaciones/pedido-ayuda");
const { estaSuspendida } = await import("@/lib/suspensiones/guardia");
const { pedirAyudaSimpleAction } = await import("./actions");

const getUser = vi.fn();
const supabase = { tag: "sesion", auth: { getUser } };

beforeEach(() => {
  vi.mocked(requireUser).mockReset();
  getUser.mockReset().mockResolvedValue({ data: { user: { id: "u-logueado" } }, error: null });
  vi.mocked(createClient).mockReset().mockResolvedValue(supabase as never);
  vi.mocked(pedirAyudaAFamilia).mockReset();
  vi.mocked(estaSuspendida).mockReset().mockResolvedValue(false);
});

describe("pedirAyudaSimpleAction (botón Ayuda del modo simple)", () => {
  it("avisa a la familia de la cuenta logueada, con un motivo fijo del servidor", async () => {
    vi.mocked(pedirAyudaAFamilia).mockResolvedValue({ status: "enviado", nombres: ["Mica", "Martina"] });
    await expect(pedirAyudaSimpleAction()).resolves.toEqual({ status: "avisado", nombres: ["Mica", "Martina"] });
    const [cliente, usuarioId, motivo] = vi.mocked(pedirAyudaAFamilia).mock.calls[0];
    expect(cliente).toBe(supabase);
    expect(usuarioId).toBe("u-logueado");
    expect(motivo).toBe("Tocó el botón Ayuda en su celular.");
  });

  it("sin sesión no redirige al login: no avisa y la pantalla ofrece llamar", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(pedirAyudaSimpleAction()).resolves.toEqual({ status: "no-avisado", razon: "error" });
    expect(requireUser).not.toHaveBeenCalled();
    expect(pedirAyudaAFamilia).not.toHaveBeenCalled();
  });

  it("una cuenta suspendida no avisa", async () => {
    vi.mocked(estaSuspendida).mockResolvedValue(true);
    await expect(pedirAyudaSimpleAction()).resolves.toEqual({ status: "no-avisado", razon: "error" });
    expect(pedirAyudaAFamilia).not.toHaveBeenCalled();
  });

  it("un pedido repetido cuenta como avisado (ya se les había avisado)", async () => {
    vi.mocked(pedirAyudaAFamilia).mockResolvedValue({ status: "repetido", nombres: ["Mica"] });
    await expect(pedirAyudaSimpleAction()).resolves.toEqual({ status: "avisado", nombres: ["Mica"] });
  });

  it("nunca dice avisado si no se avisó a nadie", async () => {
    vi.mocked(pedirAyudaAFamilia).mockResolvedValueOnce({ status: "sin-cuidadores" });
    await expect(pedirAyudaSimpleAction()).resolves.toEqual({ status: "no-avisado", razon: "sin-cuidadores" });
    vi.mocked(pedirAyudaAFamilia).mockResolvedValueOnce({ status: "tope" });
    await expect(pedirAyudaSimpleAction()).resolves.toEqual({ status: "no-avisado", razon: "tope" });
    vi.mocked(pedirAyudaAFamilia).mockResolvedValueOnce({ status: "error", message: "x" });
    await expect(pedirAyudaSimpleAction()).resolves.toEqual({ status: "no-avisado", razon: "error" });
    vi.mocked(pedirAyudaAFamilia).mockRejectedValueOnce(new Error("caído"));
    await expect(pedirAyudaSimpleAction()).resolves.toEqual({ status: "no-avisado", razon: "error" });
  });
});
