import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorHorarioMedicamentoDuplicado } from "@/lib/medicamentos/duplicados";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/medicamentos/nucleo", () => ({ agregar: vi.fn() }));
const { agregar } = await import("@/lib/medicamentos/nucleo");
const { ejecutarTool, normalizarAltaMedicamento } = await import("./tools");
const ctx = { supabase: {} as SupabaseClient, usuarioId: "propio", familia: [] };
beforeEach(() => vi.resetAllMocks());
afterEach(() => vi.restoreAllMocks());
describe("conflicto final de medicamentos", () => {
  it("alta: informa el conflicto sin tarjeta de escritura", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(agregar).mockRejectedValue(new ErrorHorarioMedicamentoDuplicado());
    const resultado = await ejecutarTool("add_medication", { name: "Metformina", scheduled_time: "08:00" }, ctx);
    expect(resultado.contenido).toContain("ya está agregado");
    expect(aviso).not.toHaveBeenCalled();
    expect(resultado.accionUI).toBeUndefined();
  });
  it("no expone detalles de fallos internos al modelo", async () => {
    vi.mocked(agregar).mockRejectedValue(new Error("internal table detail"));
    const resultado = await ejecutarTool("add_medication", { name: "Metformina", scheduled_time: "08:00" }, ctx);
    expect(resultado.contenido).not.toContain("internal table");
    expect(resultado.accionUI).toBeUndefined();
  });
  it("registra solo evento y código fijos aunque el error incluya datos clínicos", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = Object.assign(new Error("Graciela Pérez toma Metformina; SQL DETAIL usuario_id=privado"), {
      code: "Graciela", detail: "diagnóstico privado", stack: "datos de paciente",
    });
    vi.mocked(agregar).mockRejectedValue(error);
    await ejecutarTool("add_medication", { name: "Metformina", scheduled_time: "08:00" }, ctx);
    expect(aviso.mock.calls).toEqual([["medicamento_operacion_fallida", { codigo: "error_inesperado" }]]);
  });
  it("no registra los errores de entrada esperados", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    const resultado = await ejecutarTool("add_medication", { name: undefined, scheduled_time: "08:00" }, ctx);
    expect(resultado.accionUI).toBeUndefined();
    expect(aviso).not.toHaveBeenCalled();
  });
  it("usa la misma normalización para precheck y alta", () => {
    expect(normalizarAltaMedicamento({ name: "Aspirina", scheduled_time: "09:00:00", recurring_days: ["MONDAY"] })).toMatchObject({ horaProgramada: "09:00", diasRecurrentes: ["lunes"], momentoDia: "mañana" });
  });
});
