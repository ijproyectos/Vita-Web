import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/notificaciones/pedido-ayuda", () => ({ pedirAyudaAFamilia: vi.fn() }));
const { pedirAyudaAFamilia } = await import("@/lib/notificaciones/pedido-ayuda");
const { ejecutarTool } = await import("./tools");

const supabase = {} as SupabaseClient;
const ctx = { supabase, usuarioId: "yo", familia: [] };
const pedir = vi.mocked(pedirAyudaAFamilia);

beforeEach(() => vi.resetAllMocks());

describe("tool pedir_ayuda_familia", () => {
  it("usa el usuario de la sesión (ignora cualquier persona_id) y el motivo", async () => {
    pedir.mockResolvedValue({ status: "enviado", nombres: ["Martina", "Juan"] });
    const r = await ejecutarTool("pedir_ayuda_familia", { motivo: "Estoy mareada", persona_id: "otro" }, ctx);
    expect(pedir).toHaveBeenCalledWith(supabase, "yo", "Estoy mareada");
    expect(r.contenido).toContain("ENVIADO");
    expect(r.contenido).toContain("Martina y Juan");
    expect(r.accionUI).toEqual({ type: "ayuda_llamar", avisados: ["Martina", "Juan"] });
  });

  it("repetido: dice que ya se avisó, sin otro aviso", async () => {
    pedir.mockResolvedValue({ status: "repetido", nombres: ["Martina"] });
    const r = await ejecutarTool("pedir_ayuda_familia", { motivo: "x" }, ctx);
    expect(r.contenido).toContain("YA AVISADO");
    expect(r.accionUI).toEqual({ type: "ayuda_llamar", avisados: ["Martina"] });
  });

  it.each([
    [{ status: "tope" as const }, "NO SE MANDÓ"],
    [{ status: "sin-cuidadores" as const }, "NO SE AVISÓ A NADIE"],
    [{ status: "error" as const, message: "x" }, "NO SE PUDO AVISAR"],
  ])("sin entrega (%o): no afirma un aviso y deja el botón de llamar", async (resultado, marca) => {
    pedir.mockResolvedValue(resultado);
    const r = await ejecutarTool("pedir_ayuda_familia", { motivo: "x" }, ctx);
    expect(r.contenido).toContain(marca);
    expect(r.contenido).toContain("NO digas que avisaste");
    expect(r.accionUI).toEqual({ type: "ayuda_llamar", avisados: [] });
  });

  it("motivo no-string llega vacío", async () => {
    pedir.mockResolvedValue({ status: "sin-cuidadores" });
    await ejecutarTool("pedir_ayuda_familia", { motivo: 42 }, ctx);
    expect(pedir).toHaveBeenCalledWith(supabase, "yo", "");
  });
});
