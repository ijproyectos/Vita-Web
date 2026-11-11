import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/inventario/nucleo", () => ({ listarGrupos: vi.fn(), diasQueAlcanza: vi.fn(() => 10) }));
vi.mock("@/lib/mediciones/nucleo", () => ({ agregar: vi.fn(), listarRecientes: vi.fn(), listarPorTipo: vi.fn() }));
vi.mock("@/lib/mediciones/planes-nucleo", () => ({ listarSeguro: vi.fn(async () => []) }));
vi.mock("@/lib/turnos/nucleo", () => ({ listarProximos: vi.fn() }));
const inventario = await import("@/lib/inventario/nucleo");
const mediciones = await import("@/lib/mediciones/nucleo");
const turnos = await import("@/lib/turnos/nucleo");
const { ejecutarTool } = await import("./tools");
const ctx = { supabase: {} as SupabaseClient, usuarioId: "propio", familia: [] };
beforeEach(() => vi.clearAllMocks());

describe("lecturas del chat", () => {
  it("si la lectura falla, lo dice (nunca 'no tenés nada')", async () => {
    vi.mocked(inventario.listarGrupos).mockRejectedValue(new Error("db caída"));
    const r = await ejecutarTool("get_medication_stock", {}, ctx);
    expect(r.contenido).toContain("No pude leer el stock");
    expect(r.contenido).not.toContain("db caída");
  });

  it("devuelve el stock con su unidad y días", async () => {
    vi.mocked(inventario.listarGrupos).mockResolvedValue([
      { nombre: "Losartán", dosis: "50", forma: "pastilla", inventario: { stock: 20, umbral_alerta: 5 } },
      { nombre: "Sin stock", dosis: null, inventario: null },
    ] as never);
    const r = await ejecutarTool("get_medication_stock", {}, ctx);
    expect(JSON.parse(r.contenido)).toEqual([{ name: "Losartán", dose: "50", left: "20 pastillas", days_left: 10, running_low: false }]);
  });

  it("acota el límite de turnos", async () => {
    vi.mocked(turnos.listarProximos).mockResolvedValue([]);
    await ejecutarTool("list_upcoming_appointments", { limit: 500 }, ctx);
    expect(turnos.listarProximos).toHaveBeenCalledWith(ctx.supabase, "propio", 20);
  });

  it("un tipo de medición desconocido se avisa en vez de traer todas", async () => {
    const r = await ejecutarTool("list_measurements", { type: "colesterol" }, ctx);
    expect(r.contenido).toContain("No existe el tipo");
    expect(mediciones.listarRecientes).not.toHaveBeenCalled();
  });
});

describe("add_measurement", () => {
  it("rechaza un momento mal escrito sin guardar", async () => {
    const r = await ejecutarTool("add_measurement", { type: "presion", value: 130, secondary_value: 80, measured_at: "ayer" }, ctx);
    expect(r.accionUI).toBeUndefined();
    expect(mediciones.agregar).not.toHaveBeenCalled();
  });

  it("si la validación falla, no hay tarjeta", async () => {
    vi.mocked(mediciones.agregar).mockRejectedValue(new Error("La máxima tiene que ser mayor que la mínima."));
    const r = await ejecutarTool("add_measurement", { type: "presion", value: 80, secondary_value: 130 }, ctx);
    expect(r.contenido).toContain("No se guardó la medición");
    expect(r.accionUI).toBeUndefined();
  });

  it("guardada: tarjeta con el valor", async () => {
    vi.mocked(mediciones.agregar).mockResolvedValue({
      id: "m", usuario_id: "propio", tipo: "presion", valor: 130, valor_secundario: 80, pulso: null, contexto: null,
      medido_at: "2026-11-10T09:00:00-03:00", notas: null, created_at: "",
    } as never);
    const r = await ejecutarTool("add_measurement", { type: "presion", value: 130, secondary_value: 80 }, ctx);
    expect(r.accionUI).toMatchObject({ type: "measurement_added", value: "130/80 mmHg" });
  });
});
