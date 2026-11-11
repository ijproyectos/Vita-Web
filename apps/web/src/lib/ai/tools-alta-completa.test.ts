import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/medicamentos/nucleo", () => ({ agregar: vi.fn(), listarTodos: vi.fn() }));
const { listarTodos } = await import("@/lib/medicamentos/nucleo");
const { avisoMismoRemedio, normalizarAltaMedicamento } = await import("./tools");
const supabase = {} as SupabaseClient;
beforeEach(() => vi.resetAllMocks());

describe("normalizarAltaMedicamento con los datos nuevos", () => {
  it("completa la droga de una marca conocida y deja el nombre que conoce la persona", () => {
    const d = normalizarAltaMedicamento({ name: "Forxiga", scheduled_time: "08:00" });
    expect(d).toMatchObject({ nombre: "Forxiga", droga: "Dapagliflozina" });
  });

  it("la droga que dijo la persona manda", () => {
    expect(normalizarAltaMedicamento({ name: "Mi remedio", drug: "Losartán", scheduled_time: "08:00" }).droga).toBe("Losartán");
  });

  it("pasa forma, fin y cantidad", () => {
    expect(normalizarAltaMedicamento({ name: "Amoxicilina", scheduled_time: "08:00", form: "jarabe", end_date: "2026-11-17", amount_per_take: 5 })).toMatchObject({
      forma: "jarabe", fechaFin: "2026-11-17", cantidad: 5,
    });
  });

  it("rechaza una forma inventada", () => {
    expect(() => normalizarAltaMedicamento({ name: "X", scheduled_time: "08:00", form: "spray" })).toThrow(/forma/);
  });
});

describe("avisoMismoRemedio", () => {
  const datos = normalizarAltaMedicamento({ name: "Dapagliflozina", scheduled_time: "08:00" });

  it("pregunta si ya hay uno con la misma droga y otro nombre", async () => {
    vi.mocked(listarTodos).mockResolvedValue([{ nombre: "Forxiga", droga: "Dapagliflozina" }] as never);
    const r = await avisoMismoRemedio(supabase, "p", datos, {});
    expect(r?.contenido).toContain("Forxiga");
    expect(r?.accionUI).toBeUndefined();
  });

  it("con same_drug_ok, o si no hay parecido, sigue", async () => {
    vi.mocked(listarTodos).mockResolvedValue([{ nombre: "Forxiga", droga: "Dapagliflozina" }] as never);
    expect(await avisoMismoRemedio(supabase, "p", datos, { same_drug_ok: true })).toBeNull();
    vi.mocked(listarTodos).mockResolvedValue([{ nombre: "Metformina", droga: null }] as never);
    expect(await avisoMismoRemedio(supabase, "p", datos, {})).toBeNull();
  });

  it("si no puede leer la lista, no frena el alta", async () => {
    vi.mocked(listarTodos).mockRejectedValue(new Error("x"));
    expect(await avisoMismoRemedio(supabase, "p", datos, {})).toBeNull();
  });
});
