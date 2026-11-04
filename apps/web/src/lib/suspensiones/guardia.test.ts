import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("react", async (original) => ({ ...(await original<typeof import("react")>()), cache: <T,>(f: T) => f }));
const rpc = vi.fn();
vi.mock("@/lib/supabase/dispositivo", () => ({ createClientConDispositivo: async () => ({ rpc }) }));
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => {
    throw new Error(`NEXT_REDIRECT:${destino}`);
  },
}));

import { estaSuspendida, requireNoSuspendida, respuestaSiSuspendida } from "./guardia";

describe("guardia de suspensión", () => {
  beforeEach(() => rpc.mockReset());

  it("suspendida: redirige, responde 403 y estaSuspendida es true", async () => {
    rpc.mockResolvedValue({ data: [{ ms_motivo: "mal_uso", ms_desde: null }], error: null });
    await expect(requireNoSuspendida()).rejects.toThrow("NEXT_REDIRECT:/suspendida");
    const r = await respuestaSiSuspendida();
    expect(r?.status).toBe(403);
    expect(await r?.json()).toEqual({ error: "cuenta_suspendida" });
    expect(await estaSuspendida()).toBe(true);
  });
  it("sin suspensión: sigue", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await expect(requireNoSuspendida()).resolves.toBeUndefined();
    expect(await respuestaSiSuspendida()).toBeNull();
    expect(await estaSuspendida()).toBe(false);
  });
  it("si la consulta falla, falla abierto", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect(await estaSuspendida()).toBe(false);
    expect(await requireNoSuspendida()).toBeUndefined();
    expect(await respuestaSiSuspendida()).toBeNull();
  });
});
