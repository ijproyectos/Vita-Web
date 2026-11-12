import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorHorarioMedicamentoDuplicado } from "@/lib/medicamentos/duplicados";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/medicamentos/nucleo", () => ({ agregar: vi.fn(), agregarMultiMomento: vi.fn(), listarTodos: vi.fn() }));
const { agregar, agregarMultiMomento, listarTodos } = await import("@/lib/medicamentos/nucleo");
const { ejecutarTool } = await import("./tools");
const ctx = { supabase: {} as SupabaseClient, usuarioId: "propio", familia: [] };

function fila(id: string, hora: string) {
  return { id, nombre: "Amoxicilina", dosis: "500", unidad: "mg", hora_programada: `${hora}:00`, momento_dia: "mañana", dias_recurrentes: [] };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listarTodos).mockResolvedValue([]);
});
afterEach(() => vi.restoreAllMocks());

describe("add_medication con varias tomas en una sola llamada (extra_times)", () => {
  it("guarda una fila por horario con los datos de la llamada, en un solo alta", async () => {
    // The insert returns rows in any order: the card must still list them sorted.
    vi.mocked(agregarMultiMomento).mockResolvedValue([fila("b", "21:00"), fila("a", "09:00")] as never);
    const r = await ejecutarTool(
      "add_medication",
      {
        name: "Amoxicilina",
        dose: "500mg",
        scheduled_time: "9:00",
        extra_times: ["21:00"],
        condition: "Gripe",
        end_date: "2026-11-17",
        amount_per_take: 1,
        meal_indication: "despues-desayuno",
      },
      ctx
    );

    expect(agregar).not.toHaveBeenCalled();
    expect(agregarMultiMomento).toHaveBeenCalledTimes(1);
    const [, usuario, datos] = vi.mocked(agregarMultiMomento).mock.calls[0];
    expect(usuario).toBe("propio");
    expect(datos).toMatchObject({ nombre: "Amoxicilina", dosis: "500mg", condicion: "Gripe", fechaFin: "2026-11-17" });
    expect(datos.tomas?.map((t) => t.hora)).toEqual(["09:00", "21:00"]);
    expect(datos.tomas?.every((t) => t.cantidad === 1 && t.indicacion === "despues-desayuno")).toBe(true);
    expect(datos.tomas?.every((t) => t.conComida === "no-importa")).toBe(true);
    expect(r.accionUI).toMatchObject({ type: "medication_added", id: "a", name: "Amoxicilina", time: "09:00 y 21:00" });
  });

  it("sin extra_times sigue usando el alta de un horario", async () => {
    vi.mocked(agregar).mockResolvedValue(fila("a", "09:00") as never);
    await ejecutarTool("add_medication", { name: "Amoxicilina", scheduled_time: "09:00" }, ctx);
    expect(agregar).toHaveBeenCalledTimes(1);
    expect(agregarMultiMomento).not.toHaveBeenCalled();
  });

  it("una hora extra inválida no guarda nada", async () => {
    const r = await ejecutarTool("add_medication", { name: "Amoxicilina", scheduled_time: "09:00", extra_times: ["25:00"] }, ctx);
    expect(agregar).not.toHaveBeenCalled();
    expect(agregarMultiMomento).not.toHaveBeenCalled();
    expect(r.accionUI).toBeUndefined();
    expect(r.contenido).toContain("No se guardó");
  });

  it("si un horario choca con uno existente, informa el conflicto sin tarjeta de guardado", async () => {
    vi.mocked(agregarMultiMomento).mockRejectedValue(new ErrorHorarioMedicamentoDuplicado());
    const r = await ejecutarTool("add_medication", { name: "Amoxicilina", scheduled_time: "09:00", extra_times: ["21:00"] }, ctx);
    expect(r.accionUI).toBeUndefined();
    expect(r.contenido).toContain("No se guardó");
  });
});
