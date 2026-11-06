import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// `nucleo.ts` importa `server-only`; la lógica bajo prueba no depende de Next.
vi.mock("server-only", () => ({}));

import { listarHilo, obtenerSesionActiva } from "./nucleo";

function clienteSesiones(existentes: { id: string; updated_at: string }[]) {
  const insertados: unknown[] = [];
  const cliente = {
    from: () => ({
      select: () => ({
        eq: () => ({ order: () => ({ limit: async () => ({ data: existentes, error: null }) }) }),
      }),
      insert: (fila: unknown) => {
        insertados.push(fila);
        return { select: () => ({ single: async () => ({ data: { id: "nueva" }, error: null }) }) };
      },
    }),
  } as unknown as SupabaseClient;
  return { cliente, insertados };
}

describe("obtenerSesionActiva", () => {
  it("reutiliza la sesión existente y no crea otra", async () => {
    const { cliente, insertados } = clienteSesiones([{ id: "s1", updated_at: "2026-11-05T00:00:00Z" }]);
    expect(await obtenerSesionActiva(cliente, "u1")).toBe("s1");
    expect(insertados).toHaveLength(0);
  });
  it("crea una solo si la persona no tiene ninguna", async () => {
    const { cliente, insertados } = clienteSesiones([]);
    expect(await obtenerSesionActiva(cliente, "u1")).toBe("nueva");
    expect(insertados).toEqual([{ usuario_id: "u1" }]);
  });
});

describe("listarHilo", () => {
  const AHORA = Date.parse("2026-11-06T18:00:00Z");
  function clienteMensajes(filasDesc: { id: string; created_at: string }[]) {
    const filtros: Record<string, string> = {};
    let limite = 0;
    const q = {
      eq: () => q,
      gte: (_c: string, v: string) => ((filtros.gte = v), q),
      lt: (_c: string, v: string) => ((filtros.lt = v), q),
      order: () => q,
      limit: async (n: number) => ((limite = n), { data: filasDesc.slice(0, n), error: null }),
    };
    const cliente = { from: () => ({ select: () => q }) } as unknown as SupabaseClient;
    return { cliente, filtros, limite: () => limite };
  }

  it("pide desde hace 7 días, una fila de más, y devuelve cronológico con hayMas", async () => {
    const filas = [4, 3, 2, 1].map((n) => ({ id: `m${n}`, created_at: `2026-11-0${n}T00:00:00Z` }));
    const { cliente, filtros, limite } = clienteMensajes(filas);
    const r = await listarHilo(cliente, "u1", { limite: 3, ahoraMs: AHORA });
    expect(filtros.gte).toBe("2026-10-30T18:00:00.000Z");
    expect(filtros.lt).toBeUndefined();
    expect(limite()).toBe(4);
    expect(r.hayMas).toBe(true);
    expect(r.mensajes.map((m) => m.id)).toEqual(["m2", "m3", "m4"]);
  });

  it("antesDe pagina hacia atrás", async () => {
    const { cliente, filtros } = clienteMensajes([]);
    const r = await listarHilo(cliente, "u1", { antesDe: "2026-11-02T00:00:00Z", ahoraMs: AHORA });
    expect(filtros.lt).toBe("2026-11-02T00:00:00Z");
    expect(r).toEqual({ mensajes: [], hayMas: false });
  });
});
