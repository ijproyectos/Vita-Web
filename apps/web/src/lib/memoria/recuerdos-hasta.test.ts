import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));

import { borrarRecuerdosHasta } from "./privacidad";

describe("borrarRecuerdosHasta", () => {
  it("usa la RPC y devuelve cuántos recuerdos borró", async () => {
    const rpc = vi.fn(async () => ({ data: 3, error: null }));
    const r = await borrarRecuerdosHasta({ rpc } as unknown as SupabaseClient, "u1", "2026-11-06T00:00:00.000Z");
    expect(rpc).toHaveBeenCalledWith("borrar_recuerdos_hasta", { p_corte: "2026-11-06T00:00:00.000Z" });
    expect(r).toEqual({ ok: true, recuerdos: 3 });
  });
  it("un error real de la RPC frena al que llama", async () => {
    const rpc = async () => ({ data: null, error: { code: "XX000", message: "mal" } });
    expect(await borrarRecuerdosHasta({ rpc } as unknown as SupabaseClient, "u1", "2026-11-06T00:00:00.000Z")).toEqual({ ok: false });
  });
});
